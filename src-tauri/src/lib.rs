// meusic — Rust backend
// Recursive audio library scanning + tag/cover-art extraction via lofty.

mod radio;

use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use lofty::config::WriteOptions;
use lofty::prelude::*;
use lofty::read_from_path;
use lofty::tag::{ItemKey, Tag};
use rayon::prelude::*;
use serde::Serialize;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

/// Cap cover images we read into memory + base64 over IPC, so a giant cover.png
/// or embedded picture can't spike memory / freeze the bridge.
const MAX_COVER_BYTES: u64 = 12 * 1024 * 1024;

/// Serializes tag writes so two concurrent saves can't interleave on a file.
static TAG_WRITE_LOCK: Mutex<()> = Mutex::new(());
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::Manager;
use walkdir::WalkDir;

/// Metadata for a single audio track. `path` is the absolute file path the
/// frontend turns into an asset URL (via convertFileSrc) for playback.
#[derive(Serialize, Clone)]
struct Track {
    path: String,
    title: String,
    artist: String,
    album: String,
    album_artist: String,
    track_no: u32,
    duration: u64, // seconds
    has_cover: bool,
    format: String, // e.g. "FLAC", "MP3"
    bitrate: u32,   // kbps, 0 if unknown
}

const AUDIO_EXTS: &[&str] = &[
    "mp3", "flac", "wav", "ogg", "m4a", "aac", "opus", "wma", "aiff", "aif", "alac",
];

fn is_audio(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| AUDIO_EXTS.contains(&e.to_lowercase().as_str()))
        .unwrap_or(false)
}

/// Read tags + properties for one file. Always returns a Track — on any read
/// failure it falls back to sensible defaults (filename as title) so a single
/// broken file never aborts a whole library scan.
fn read_track(path: &Path) -> Track {
    let path_str = path.to_string_lossy().to_string();
    let file_stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Unknown")
        .to_string();

    let mut title = file_stem;
    let mut artist = String::from("Unknown Artist");
    let mut album = String::from("Unknown Album");
    let mut album_artist = String::new();
    let mut track_no = 0u32;
    let mut duration = 0u64;
    let mut has_cover = false;
    let mut bitrate = 0u32;
    let format = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_uppercase())
        .unwrap_or_default();

    if let Ok(tagged) = read_from_path(path) {
        let props = tagged.properties();
        duration = props.duration().as_secs();
        bitrate = props
            .audio_bitrate()
            .or_else(|| props.overall_bitrate())
            .unwrap_or(0);
        if let Some(tag) = tagged.primary_tag().or_else(|| tagged.first_tag()) {
            if let Some(t) = tag.title() {
                if !t.trim().is_empty() {
                    title = t.to_string();
                }
            }
            if let Some(a) = tag.artist() {
                if !a.trim().is_empty() {
                    artist = a.to_string();
                }
            }
            if let Some(al) = tag.album() {
                if !al.trim().is_empty() {
                    album = al.to_string();
                }
            }
            if let Some(aa) = tag.get_string(&ItemKey::AlbumArtist) {
                album_artist = aa.to_string();
            }
            if let Some(tn) = tag.track() {
                track_no = tn;
            }
            has_cover = !tag.pictures().is_empty();
        }
    }

    if album_artist.trim().is_empty() {
        album_artist = artist.clone();
    }

    Track {
        path: path_str,
        title,
        artist,
        album,
        album_artist,
        track_no,
        duration,
        has_cover,
        format,
        bitrate,
    }
}

/// Recursively scan a folder (and all subfolders) for audio files, read their
/// metadata in parallel, and return them sorted by album-artist → album →
/// track number → title so albums group together naturally.
#[tauri::command]
async fn scan_folder(path: String) -> Vec<Track> {
    // Run off the command thread: a large library / network drive can take
    // many seconds, and a sync command would block the UI while it walks.
    tauri::async_runtime::spawn_blocking(move || scan_folder_blocking(&path))
        .await
        .unwrap_or_default()
}

fn scan_folder_blocking(path: &str) -> Vec<Track> {
    let mut walk_errors = 0usize;
    let files: Vec<_> = WalkDir::new(path)
        .follow_links(false)
        .into_iter()
        .filter_map(|e| match e {
            Ok(entry) => Some(entry),
            // Don't let one unreadable dir (permissions/IO) abort the whole
            // scan — skip it, but log so a silently-missing folder is traceable.
            Err(err) => {
                walk_errors += 1;
                log_line(&format!("[WARN] scan skip: {err}"));
                None
            }
        })
        .filter(|e| e.file_type().is_file() && is_audio(e.path()))
        .map(|e| e.into_path())
        .collect();
    if walk_errors > 0 {
        log_line(&format!("[INFO] scan_folder: {walk_errors} entries skipped"));
    }

    let mut tracks: Vec<Track> = files.par_iter().map(|p| read_track(p)).collect();

    tracks.sort_by(|a, b| {
        (
            a.album_artist.to_lowercase(),
            a.album.to_lowercase(),
            a.track_no,
            a.title.to_lowercase(),
        )
            .cmp(&(
                b.album_artist.to_lowercase(),
                b.album.to_lowercase(),
                b.track_no,
                b.title.to_lowercase(),
            ))
    });

    tracks
}

const IMAGE_EXTS: &[&str] = &["jpg", "jpeg", "png", "webp", "bmp", "gif"];
const COVER_NAMES: &[&str] = &[
    "cover",
    "folder",
    "front",
    "album",
    "albumart",
    "albumartsmall",
    "thumb",
    "artwork",
];

fn image_mime_ext(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .as_deref()
    {
        Some("png") => "image/png",
        Some("webp") => "image/webp",
        Some("bmp") => "image/bmp",
        Some("gif") => "image/gif",
        _ => "image/jpeg",
    }
}

/// Detect the image type from magic bytes (so a mislabeled `.jpg` that's really
/// PNG/WebP gets the right MIME and the <img> can decode it), falling back to
/// the extension when the signature is unrecognized.
fn image_mime(bytes: &[u8], path: &Path) -> &'static str {
    if bytes.len() >= 12 {
        if bytes.starts_with(&[0x89, b'P', b'N', b'G']) {
            return "image/png";
        }
        if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
            return "image/jpeg";
        }
        if bytes.starts_with(b"GIF8") {
            return "image/gif";
        }
        if &bytes[0..2] == b"BM" {
            return "image/bmp";
        }
        if &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
            return "image/webp";
        }
    }
    image_mime_ext(path)
}

fn file_as_data_uri(path: &Path) -> Option<String> {
    // Reject oversized covers up front (metadata read, no allocation) so a huge
    // image can't blow up memory / the IPC payload.
    let len = std::fs::metadata(path).ok()?.len();
    if len == 0 || len > MAX_COVER_BYTES {
        return None;
    }
    let bytes = std::fs::read(path).ok()?;
    if bytes.is_empty() {
        return None;
    }
    Some(format!(
        "data:{};base64,{}",
        image_mime(&bytes, path),
        STANDARD.encode(&bytes)
    ))
}

/// Look beside the audio file for a standalone cover image — first the common
/// well-known names (cover.jpg, folder.jpg, …), then any image in the folder.
/// This is how players like Dopamine find art for files without embedded tags.
fn folder_cover(audio_path: &Path) -> Option<String> {
    let dir = audio_path.parent()?;

    for name in COVER_NAMES {
        for ext in IMAGE_EXTS {
            let candidate = dir.join(format!("{name}.{ext}"));
            if candidate.is_file() {
                if let Some(uri) = file_as_data_uri(&candidate) {
                    return Some(uri);
                }
            }
        }
    }

    // Fallback: the first image file we find in the folder.
    let entries = std::fs::read_dir(dir).ok()?;
    for entry in entries.flatten() {
        let p = entry.path();
        if p.is_file() {
            let is_image = p
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| IMAGE_EXTS.contains(&e.to_lowercase().as_str()))
                .unwrap_or(false);
            if is_image {
                if let Some(uri) = file_as_data_uri(&p) {
                    return Some(uri);
                }
            }
        }
    }
    None
}

/// Cover art for a single track as a base64 data URI: embedded art first, then
/// a standalone image in the track's folder. Loaded lazily (per displayed/
/// playing track) so large libraries stay light on memory.
#[tauri::command]
fn get_cover(path: String) -> Option<String> {
    let p = Path::new(&path);

    // 1. Embedded picture in the tags (skip absurdly large ones — fall through
    //    to a folder image rather than base64-ing tens of MB over the bridge).
    if let Ok(tagged) = read_from_path(p) {
        if let Some(tag) = tagged.primary_tag().or_else(|| tagged.first_tag()) {
            if let Some(pic) = tag.pictures().first() {
                if (pic.data().len() as u64) <= MAX_COVER_BYTES {
                    let mime = pic
                        .mime_type()
                        .map(|m| m.as_str().to_string())
                        .unwrap_or_else(|| "image/jpeg".to_string());
                    return Some(format!("data:{};base64,{}", mime, STANDARD.encode(pic.data())));
                }
            }
        }
    }

    // 2. A cover image sitting in the same folder.
    folder_cover(p)
}

/// Write edited metadata back into the file's tag and return the freshly re-read
/// Track. We mutate the file's EXISTING primary tag (rather than replacing it)
/// so embedded cover art and any other frames are preserved; a brand-new tag of
/// the file's native type is created only when the file had no tags at all.
/// Empty album-artist / track number clear those fields rather than writing
/// blanks. An empty `title` is rejected so a track never loses its name.
#[tauri::command]
fn write_tags(
    path: String,
    title: String,
    artist: String,
    album: String,
    album_artist: String,
    track_no: u32,
) -> Result<Track, String> {
    let title = title.trim();
    if title.is_empty() {
        return Err("Judul tidak boleh kosong".into());
    }
    let p = Path::new(&path);

    // Serialize writes so two concurrent saves can't interleave on one file.
    let _guard = TAG_WRITE_LOCK.lock().unwrap_or_else(|e| e.into_inner());

    // Write atomically: tag a temp copy, then rename it over the original. The
    // rename is the commit, so a crash / power loss / disk-full mid-write leaves
    // the original file (and its embedded art) intact instead of truncated.
    //
    // Keep the original extension *last* (e.g. `song.meusic-tmp.mp3`) so lofty can
    // still detect the format from it. Naming the temp `song.meusic-tmp` strips the
    // `.mp3` hint and forces content-sniffing, which fails on files that have junk
    // before the first frame ("No format could be determined from the provided file").
    let tmp = match p.extension().and_then(|e| e.to_str()) {
        Some(ext) if !ext.is_empty() => p.with_extension(format!("meusic-tmp.{ext}")),
        _ => p.with_extension("meusic-tmp"),
    };
    std::fs::copy(p, &tmp).map_err(|e| e.to_string())?;

    let result = (|| -> Result<(), String> {
        let mut tagged = read_from_path(&tmp).map_err(|e| e.to_string())?;
        if tagged.primary_tag_mut().is_none() {
            let tt = tagged.primary_tag_type();
            tagged.insert_tag(Tag::new(tt));
        }
        let tag = tagged
            .primary_tag_mut()
            .ok_or("Format ini tidak mendukung penulisan tag")?;

        tag.set_title(title.to_string());
        tag.set_artist(artist.trim().to_string());
        tag.set_album(album.trim().to_string());

        let aa = album_artist.trim();
        if aa.is_empty() {
            tag.remove_key(&ItemKey::AlbumArtist);
        } else {
            tag.insert_text(ItemKey::AlbumArtist, aa.to_string());
        }

        if track_no == 0 {
            tag.remove_track();
        } else {
            tag.set_track(track_no);
        }

        tagged
            .save_to_path(&tmp, WriteOptions::default())
            .map_err(|e| e.to_string())
    })();

    if let Err(e) = result {
        let _ = std::fs::remove_file(&tmp);
        log_line(&format!("[ERROR] write_tags failed for {path}: {e}"));
        return Err(e);
    }

    std::fs::rename(&tmp, p).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        log_line(&format!("[ERROR] write_tags rename failed for {path}: {e}"));
        e.to_string()
    })?;

    Ok(read_track(p))
}

// ---- Crash / error logging --------------------------------------------------

/// Log file at %LOCALAPPDATA%\meusic\meusic.log (falls back to the cwd).
fn log_path() -> PathBuf {
    let base = std::env::var("LOCALAPPDATA").unwrap_or_else(|_| ".".to_string());
    let dir = Path::new(&base).join("meusic");
    let _ = std::fs::create_dir_all(&dir);
    dir.join("meusic.log")
}

/// Append a timestamped line to the log file (best-effort, never panics).
pub(crate) fn log_line(line: &str) {
    let ts = chrono::Local::now().format("%Y-%m-%d %H:%M:%S");
    if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(log_path()) {
        let _ = writeln!(f, "{ts} {line}");
    }
}

/// Capture Rust panics into the log (instead of a silent crash) for monitoring.
fn install_panic_hook() {
    let default = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        log_line(&format!("[PANIC] {info}"));
        default(info);
    }));
}

/// Frontend-reported error/event, written to the same log.
#[tauri::command]
fn log_event(level: String, message: String) {
    log_line(&format!("[{level}] {message}"));
}

/// Show / focus / unminimize the main window (from tray menu or mini-player).
fn reveal_main(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

/// Toggle the tray mini-player popup, positioning it at the bottom-right of the
/// primary monitor (just above the taskbar / tray area).
fn toggle_mini(app: &tauri::AppHandle) {
    let Some(mini) = app.get_webview_window("miniplayer") else {
        return;
    };
    if mini.is_visible().unwrap_or(false) {
        let _ = mini.hide();
        return;
    }
    if let Ok(Some(mon)) = mini.primary_monitor() {
        let msize = mon.size();
        let mpos = mon.position();
        let wsize = mini
            .outer_size()
            .unwrap_or(tauri::PhysicalSize::new(320, 300));
        let margin = 12i32;
        let taskbar = 56i32;
        let x = mpos.x + msize.width as i32 - wsize.width as i32 - margin;
        let y = mpos.y + msize.height as i32 - wsize.height as i32 - taskbar;
        let _ = mini.set_position(tauri::PhysicalPosition::new(x, y));
    }
    let _ = mini.show();
    let _ = mini.set_focus();
}

/// Toggle the system-tray icon's visibility (honors the user setting).
#[tauri::command]
fn set_tray_visible(app: tauri::AppHandle, visible: bool) {
    if let Some(tray) = app.tray_by_id("main") {
        let _ = tray.set_visible(visible);
    }
}

// ---- Persistent key/value store (file-backed) -------------------------------
// Settings/session are written to disk so they survive an OS shutdown, which can
// kill the process before WebView2 flushes localStorage to disk.

/// Path to `<name>.json` in the per-app config dir (%APPDATA%\com.sarta.meusic).
fn store_path(app: &tauri::AppHandle, name: &str) -> Option<PathBuf> {
    // Only allow simple store names so a crafted `name` (e.g. "..\\..\\x")
    // can't traverse out of the config dir.
    if name.is_empty()
        || !name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
    {
        return None;
    }
    let dir = app.path().app_config_dir().ok()?;
    let _ = std::fs::create_dir_all(&dir);
    Some(dir.join(format!("{name}.json")))
}

/// Read a named store's contents (None if it doesn't exist yet).
#[tauri::command]
fn load_store(app: tauri::AppHandle, name: String) -> Option<String> {
    let p = store_path(&app, &name)?;
    std::fs::read_to_string(p).ok()
}

/// Write a named store's contents to disk (immediately, no buffering).
#[tauri::command]
fn save_store(app: tauri::AppHandle, name: String, contents: String) -> Result<(), String> {
    let p = store_path(&app, &name).ok_or("invalid store name")?;
    // Atomic write: a crash mid-write would otherwise leave a truncated/corrupt
    // JSON that fails to parse on next launch (losing settings/session).
    let tmp = p.with_extension("json.tmp");
    std::fs::write(&tmp, contents.as_bytes()).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &p).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        e.to_string()
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    install_panic_hook();
    log_line("[INFO] app start");
    tauri::Builder::default()
        // Single-instance must be registered first: a second launch forwards to
        // this callback (reveal the existing window) instead of opening anew.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            reveal_main(app);
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let show = MenuItem::with_id(app, "show", "Tampilkan meusic", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Keluar", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;

            let mut builder = TrayIconBuilder::with_id("main")
                .tooltip("meusic")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => reveal_main(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        toggle_mini(tray.app_handle());
                    }
                });
            // Guard against a missing icon instead of unwrap()-panicking on startup.
            if let Some(icon) = app.default_window_icon() {
                builder = builder.icon(icon.clone());
            }
            builder.build(app)?;

            // Start the internet-radio streaming proxy (loopback HTTP server).
            radio::start(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            scan_folder,
            get_cover,
            write_tags,
            set_tray_visible,
            log_event,
            load_store,
            save_store,
            radio::radio_proxy_port
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
