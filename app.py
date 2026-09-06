import os
import sys
import re
import uuid
import time
import threading
import zipfile
from urllib.parse import urlparse
from typing import Optional, List
from fastapi import FastAPI, HTTPException, BackgroundTasks, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from pydantic import BaseModel
import requests
import instaloader
import yt_dlp
import shutil

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DOWNLOAD_DIR = os.path.join(BASE_DIR, "downloads")
os.makedirs(DOWNLOAD_DIR, exist_ok=True)

# Ensure ffmpeg location is detected and present in PATH
def get_ffmpeg_dir():
    ffmpeg_path = shutil.which("ffmpeg")
    if ffmpeg_path:
        return os.path.dirname(ffmpeg_path)
    
    candidates = ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"]
    for c in candidates:
        if os.path.exists(os.path.join(c, "ffmpeg")):
            return c
    return None

FFMPEG_DIR = get_ffmpeg_dir()
if FFMPEG_DIR:
    os.environ["PATH"] = FFMPEG_DIR + os.pathsep + os.environ.get("PATH", "")

app = FastAPI(title="Sword Art Stream - Multi-Platform Media Downloader")

@app.middleware("http")
async def add_no_cache_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response

# Static files mapping
STATIC_DIR = os.path.join(BASE_DIR, "static")
os.makedirs(STATIC_DIR, exist_ok=True)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

# In-memory download task state tracking & media cache
tasks = {}
media_cache = {}

def extract_clean_url(text: str) -> str:
    """Trích xuất URL sạch từ chuỗi nhập vào, hỗ trợ cả tin nhắn chia sẻ từ app di động"""
    if not text:
        return ""
    match = re.search(r'https?://[^\s<>\"\'\)]+', text)
    if match:
        url = match.group(0).rstrip('.,;!?')
        return url
    return text.strip()

def extract_instagram_shortcode(url: str) -> Optional[str]:
    """Trích xuất shortcode bài viết Instagram (dạng /p/ABC/, /share/p/ABC/, /reel/ABC/)"""
    match = re.search(r'(?:instagram\.com(?:/share)?/(?:p|reels?|tv)/|instagr\.am/p/)([\w\-]+)', url)
    if match:
        return match.group(1)
    return None

def detect_platform(url: str) -> dict:
    """Nhận diện mạng xã hội từ URL và trả về metadata hiển thị chuẩn SAO HUD"""
    u = url.lower()
    if "instagram.com" in u or "instagr.am" in u:
        return {
            "id": "instagram",
            "name": "Instagram",
            "sub": "FEED / REELS / CAROUSEL",
            "icon": "fa-brands fa-instagram",
            "color": "#e1306c",
            "badge_class": "badge-instagram"
        }
    elif "youtube.com" in u or "youtu.be" in u:
        return {
            "id": "youtube",
            "name": "YouTube",
            "sub": "VIDEO / SHORTS / MUSIC",
            "icon": "fa-brands fa-youtube",
            "color": "#ff0000",
            "badge_class": "badge-youtube"
        }
    elif "tiktok.com" in u:
        return {
            "id": "tiktok",
            "name": "TikTok",
            "sub": "SHORT VIDEO / SOUND",
            "icon": "fa-brands fa-tiktok",
            "color": "#00f2fe",
            "badge_class": "badge-tiktok"
        }
    elif "douyin.com" in u or "iesdouyin.com" in u:
        return {
            "id": "douyin",
            "name": "Douyin",
            "sub": "TIKTOK CN / SOUND",
            "icon": "fa-solid fa-music",
            "color": "#fe2c55",
            "badge_class": "badge-douyin"
        }
    elif "facebook.com" in u or "fb.watch" in u or "fb.com" in u:
        return {
            "id": "facebook",
            "name": "Facebook",
            "sub": "WATCH / REELS / POST",
            "icon": "fa-brands fa-facebook",
            "color": "#1877f2",
            "badge_class": "badge-facebook"
        }
    elif "twitter.com" in u or "x.com" in u or "t.co" in u:
        return {
            "id": "x",
            "name": "X (Twitter)",
            "sub": "POST / MEDIA / CLIP",
            "icon": "fa-brands fa-x-twitter",
            "color": "#e5e7eb",
            "badge_class": "badge-x"
        }
    else:
        return {
            "id": "other",
            "name": "Web Media",
            "sub": "DIRECT STREAM / MEDIA",
            "icon": "fa-solid fa-globe",
            "color": "#00f0ff",
            "badge_class": "badge-other"
        }

def get_instagram_media_info(shortcode: str) -> dict:
    """Lấy thông tin bài viết Instagram, đặc biệt hỗ trợ ảnh đơn và album nhiều ảnh (carousel)"""
    if shortcode in media_cache:
        return media_cache[shortcode]
    
    try:
        L = instaloader.Instaloader(
            download_pictures=False,
            download_videos=False,
            download_video_thumbnails=False,
            save_metadata=False,
            quiet=True
        )
        post = instaloader.Post.from_shortcode(L.context, shortcode)
        
        # Nếu là video đơn thuần
        if post.is_video and post.typename != 'GraphSidecar':
            res = {
                'is_image': False,
                'is_video': True,
                'title': (post.caption or f'Instagram Video [{shortcode}]').split('\n')[0][:120],
                'channel': f'@{post.owner_username}',
                'thumbnail': post.url
            }
            media_cache[shortcode] = res
            return res
        
        images = []
        if post.typename == 'GraphSidecar':
            # Album nhiều ảnh/video (carousel)
            for idx, node in enumerate(post.get_sidecar_nodes()):
                images.append({
                    'index': idx + 1,
                    'url': node.display_url,
                    'is_video': node.is_video,
                    'video_url': node.video_url if node.is_video else None
                })
        else:
            # Bài đăng 1 ảnh duy nhất
            images.append({
                'index': 1,
                'url': post.url,
                'is_video': False,
                'video_url': None
            })
            
        caption = (post.caption or f'Instagram Photo [{shortcode}]').split('\n')[0][:120]
        res = {
            'is_image': True,
            'is_video': False,
            'is_carousel': len(images) > 1,
            'count': len(images),
            'images': images,
            'title': caption,
            'channel': f'@{post.owner_username}',
            'thumbnail': images[0]['url'] if images else post.url,
            'likes': post.likes,
            'shortcode': shortcode
        }
        media_cache[shortcode] = res
        return res
    except Exception as e:
        return {'error': str(e)}

def get_tiktok_media_info(url: str) -> dict:
    """Lấy thông tin và liên kết video/album ảnh không watermark từ TikTok / Douyin qua TikWM API"""
    clean_url = extract_clean_url(url)
    cache_key = f"tiktok_{clean_url}"
    if cache_key in media_cache:
        return media_cache[cache_key]

    try:
        api_url = f"https://www.tikwm.com/api/?url={requests.utils.quote(clean_url)}"
        headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
        }
        resp = requests.get(api_url, headers=headers, timeout=15)
        if resp.status_code != 200:
            return {'error': f"TikWM API HTTP error {resp.status_code}"}
        data = resp.json()
        if data.get('code') != 0:
            return {'error': data.get('msg') or "Không thể trích xuất dữ liệu TikTok"}
        
        d = data.get('data', {})
        images_list = d.get('images', [])
        is_images = bool(images_list and len(images_list) > 0)
        
        title = (d.get('title') or f"TikTok Media [{d.get('id')}]").split('\n')[0][:120].strip()
        author_name = d.get('author', {}).get('nickname') or d.get('author', {}).get('unique_id') or "TikTok Creator"
        
        duration_sec = d.get('duration', 0)
        if duration_sec:
            duration_str = f"{duration_sec // 60}:{duration_sec % 60:02d}"
        else:
            duration_str = "Slide / Clip"
            
        images = []
        if is_images:
            for idx, img_url in enumerate(images_list):
                images.append({
                    'index': idx + 1,
                    'url': img_url,
                    'thumbnail': img_url,
                    'is_video': False,
                    'video_url': None
                })
        
        res = {
            'id': d.get('id'),
            'title': title,
            'channel': f"@{author_name}",
            'thumbnail': d.get('cover') or d.get('origin_cover') or "",
            'duration': f"Album ({len(images)} ảnh)" if is_images else duration_str,
            'view_count': d.get('play_count') or d.get('digg_count') or 0,
            'play_url': d.get('play'),
            'wm_play_url': d.get('wmplay'),
            'music_url': d.get('music'),
            'is_image': is_images,
            'is_carousel': is_images and len(images) > 1,
            'image_count': len(images) if is_images else 0,
            'images': images,
            'size': d.get('size', 0)
        }
        media_cache[cache_key] = res
        return res
    except Exception as e:
        return {'error': str(e)}

def download_tiktok_media(task_id: str, clean_url: str, format_type: str, selected_indices: Optional[List[int]] = None):
    cache_key = f"tiktok_{clean_url}"
    data = media_cache.get(cache_key) or get_tiktok_media_info(clean_url)
    if not data or data.get('error'):
        raise Exception(data.get('error') if data else "Không tìm thấy dữ liệu từ TikTok")
    
    title = data.get('title') or f"TikTok_{data.get('id')}"
    safe_title = re.sub(r'[\\/*?:"<>|]', '', title)[:80].strip() or f"TikTok_{data.get('id')}"
    
    tasks[task_id].update({
        "status": "downloading",
        "progress": 5.0,
        "speed": "Starting...",
        "eta": "Calculating..."
    })
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Referer': 'https://www.tiktok.com/'
    }
    
    # 1. Nếu là bài đăng dạng album ảnh
    if data.get('is_image') and data.get('images'):
        all_images = data['images']
        if selected_indices and len(selected_indices) > 0:
            images = [img for img in all_images if img.get('index') in selected_indices]
            if not images:
                images = all_images
        else:
            images = all_images
            
        if format_type == "image_original" or len(images) == 1:
            img_url = images[0]['url']
            final_filename = f"{safe_title} [tiktok_img_{data.get('id')}].jpg"
            filepath = os.path.join(DOWNLOAD_DIR, final_filename)
            resp = requests.get(img_url, headers=headers, timeout=25)
            with open(filepath, 'wb') as f:
                f.write(resp.content)
        else:
            final_filename = f"{safe_title} [tiktok_album_{data.get('id')}].zip"
            filepath = os.path.join(DOWNLOAD_DIR, final_filename)
            with zipfile.ZipFile(filepath, 'w', zipfile.ZIP_DEFLATED) as zipf:
                total_imgs = len(images)
                for idx, img in enumerate(images):
                    resp = requests.get(img['url'], headers=headers, timeout=25)
                    if resp.status_code == 200:
                        img_name = f"{safe_title}_{img.get('index', idx+1):02d}.jpg"
                        zipf.writestr(img_name, resp.content)
                    tasks[task_id].update({
                        "progress": round((idx + 1) / total_imgs * 90.0, 1),
                        "speed": "Zipping photos...",
                        "eta": f"{total_imgs - idx - 1} left"
                    })
                    
        tasks[task_id].update({
            "status": "completed",
            "progress": 100.0,
            "speed": "0 MB/s",
            "eta": "0s",
            "filename": final_filename,
            "title": title,
            "filesize": os.path.getsize(filepath) if os.path.exists(filepath) else 0
        })
        return

    # 2. Nếu chọn trích xuất âm thanh MP3
    if format_type == "mp3" and data.get('music_url'):
        download_url = data['music_url']
        final_filename = f"{safe_title} [tiktok_sound_{data.get('id')}].mp3"
    else:
        download_url = data.get('play_url') or data.get('wm_play_url')
        if not download_url:
            raise Exception("Không tìm thấy liên kết tải video từ TikTok")
        final_filename = f"{safe_title} [tiktok_{data.get('id')}].mp4"
        
    filepath = os.path.join(DOWNLOAD_DIR, final_filename)
    
    with requests.get(download_url, headers=headers, stream=True, timeout=30) as r:
        r.raise_for_status()
        total_size = int(r.headers.get('content-length', 0)) or data.get('size', 0)
        downloaded = 0
        start_time = time.time()
        
        with open(filepath, 'wb') as f:
            for chunk in r.iter_content(chunk_size=65536):
                if chunk:
                    f.write(chunk)
                    downloaded += len(chunk)
                    elapsed = time.time() - start_time
                    if elapsed > 0 and total_size > 0:
                        speed = downloaded / elapsed
                        speed_str = f"{speed / (1024 * 1024):.2f} MB/s"
                        percent = (downloaded / total_size) * 100.0
                        eta = int((total_size - downloaded) / speed) if speed > 0 else 0
                        tasks[task_id].update({
                            "status": "downloading",
                            "progress": round(min(percent, 99.0), 1),
                            "speed": speed_str,
                            "eta": f"{eta}s",
                            "downloaded_bytes": downloaded,
                            "total_bytes": total_size
                        })
                        
    tasks[task_id].update({
        "status": "completed",
        "progress": 100.0,
        "speed": "0 MB/s",
        "eta": "0s",
        "filename": final_filename,
        "title": title,
        "filesize": os.path.getsize(filepath) if os.path.exists(filepath) else 0
    })

class DownloadRequest(BaseModel):
    url: str
    format_type: str = "best" # "best", "1080p", "720p", "480p", "mp3", "image_original", "image_zip", "image_selected"
    selected_indices: Optional[List[int]] = None # Danh sách số thứ tự ảnh được chọn (VD: [1, 2])

class InfoRequest(BaseModel):
    url: str

def progress_hook(d, task_id: str):
    if task_id not in tasks:
        return
    
    if d['status'] == 'downloading':
        total = d.get('total_bytes') or d.get('total_bytes_estimate') or 0
        downloaded = d.get('downloaded_bytes', 0)
        speed = d.get('speed', 0)
        eta = d.get('eta', 0)
        
        percent = (downloaded / total * 100) if total > 0 else 0
        
        speed_str = f"{speed / (1024 * 1024):.2f} MB/s" if speed else "Calculating..."
        eta_str = f"{eta}s" if eta is not None else "Calculating..."
        
        tasks[task_id].update({
            "status": "downloading",
            "progress": round(percent, 1),
            "speed": speed_str,
            "eta": eta_str,
            "downloaded_bytes": downloaded,
            "total_bytes": total
        })
    elif d['status'] == 'finished':
        tasks[task_id].update({
            "status": "processing",
            "progress": 99.0,
            "speed": "Processing...",
            "eta": "Finishing up..."
        })

def download_instagram_images(task_id: str, shortcode: str, format_type: str, selected_indices: Optional[List[int]] = None):
    """Xử lý tải ảnh đơn, album ảnh hoặc danh sách ảnh được chọn lọc từ Instagram"""
    data = media_cache.get(shortcode) or get_instagram_media_info(shortcode)
    if not data or not data.get('images'):
        raise Exception(data.get('error') or "Không thể trích xuất dữ liệu ảnh từ bài đăng")
        
    all_images = data['images']
    
    # Lọc ảnh theo danh sách chọn nếu có
    if selected_indices and len(selected_indices) > 0:
        images = [img for img in all_images if img.get('index') in selected_indices]
        if not images:
            images = all_images
    else:
        images = all_images

    raw_title = data.get('title') or f"SAO_Item_{shortcode}"
    safe_title = "".join(c for c in raw_title if c.isalnum() or c in (' ', '_', '-')).strip()[:40]
    if not safe_title:
        safe_title = f"instagram_{shortcode}"
        
    headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
    }

    tasks[task_id].update({
        "status": "downloading",
        "progress": 10.0,
        "speed": "Initializing item retrieval...",
        "eta": "Connecting..."
    })

    # Nếu tải nhiều ảnh (album hoặc chọn > 1 ảnh) -> Đóng gói ZIP
    if len(images) > 1 or format_type in ["image_zip", "image_selected"]:
        zip_filename = f"{safe_title} [{shortcode}]_pack_{len(images)}items.zip"
        zip_path = os.path.join(DOWNLOAD_DIR, zip_filename)
        
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
            total = len(images)
            for i, img in enumerate(images):
                img_url = img['url']
                resp = requests.get(img_url, headers=headers, timeout=30)
                if resp.status_code == 200:
                    img_idx = img.get('index', i + 1)
                    img_name = f"{safe_title}_item{img_idx}.jpg"
                    zf.writestr(img_name, resp.content)
                    
                pct = round(((i + 1) / total) * 90 + 5, 1)
                tasks[task_id].update({
                    "status": "downloading",
                    "progress": pct,
                    "speed": f"Retrieved {i+1}/{total} items",
                    "eta": f"{total - (i+1)} items remaining"
                })
                
        final_filename = zip_filename
    else:
        # Tải 1 ảnh duy nhất
        img = images[0]
        img_url = img['url']
        resp = requests.get(img_url, headers=headers, timeout=30)
        if resp.status_code != 200:
            raise Exception(f"Máy chủ phản hồi lỗi HTTP {resp.status_code}")
            
        img_idx = img.get('index', 1)
        img_filename = f"{safe_title} [{shortcode}]_item{img_idx}.jpg"
        img_path = os.path.join(DOWNLOAD_DIR, img_filename)
        with open(img_path, 'wb') as f:
            f.write(resp.content)
            
        final_filename = img_filename
        
    filepath = os.path.join(DOWNLOAD_DIR, final_filename)
    tasks[task_id].update({
        "status": "completed",
        "progress": 100.0,
        "speed": "0 MB/s",
        "eta": "0s",
        "filename": final_filename,
        "title": data.get('title', final_filename),
        "filesize": os.path.getsize(filepath) if os.path.exists(filepath) else 0
    })

def download_worker(task_id: str, raw_url: str, format_type: str, selected_indices: Optional[List[int]] = None):
    try:
        url = extract_clean_url(raw_url)
        shortcode = extract_instagram_shortcode(url)

        # Nếu là tải ảnh Instagram (hoặc format ảnh / danh sách ảnh được chọn)
        if format_type in ["image_original", "image_zip", "image_selected"] or (shortcode and shortcode in media_cache and media_cache[shortcode].get('is_image')):
            if shortcode:
                download_instagram_images(task_id, shortcode, format_type, selected_indices)
                return

        # Nếu là TikTok hoặc Douyin
        platform_info = detect_platform(url)
        if platform_info['id'] in ['tiktok', 'douyin']:
            try:
                download_tiktok_media(task_id, url, format_type, selected_indices)
                return
            except Exception as tt_err:
                print(f"[TikTok Direct Fallback]: {tt_err}, trying yt-dlp fallback...")

        filename_holder = {"filename": None}

        def postprocessor_hook(d):
            if d['status'] == 'finished':
                fn = d.get('info_dict', {}).get('_filename')
                if fn:
                    filename_holder["filename"] = fn

        output_template = os.path.join(DOWNLOAD_DIR, '%(title)s [%(id)s].%(ext)s')

        if format_type == "mp3":
            ydl_opts = {
                'format': 'bestaudio/best',
                'postprocessors': [{
                    'key': 'FFmpegExtractAudio',
                    'preferredcodec': 'mp3',
                    'preferredquality': '320',
                }],
                'outtmpl': output_template,
                'progress_hooks': [lambda d: progress_hook(d, task_id)],
                'postprocessor_hooks': [postprocessor_hook],
                'quiet': True,
                'no_warnings': True,
                'nocheckcertificate': True,
                'outtmpl_na_placeholder': 'NA',
                'hls_prefer_native': True,
                'retries': 10,
                'fragment_retries': 10
            }
        else:
            if format_type == "1080p":
                fmt = 'bestvideo[height<=1080]+bestaudio/best[height<=1080]/bestvideo+bestaudio/best'
            elif format_type == "720p":
                fmt = 'bestvideo[height<=720]+bestaudio/best[height<=720]/bestvideo+bestaudio/best'
            elif format_type == "480p":
                fmt = 'bestvideo[height<=480]+bestaudio/best[height<=480]/bestvideo+bestaudio/best'
            else: # "best"
                fmt = 'bestvideo+bestaudio/best'

            ydl_opts = {
                'format': fmt,
                'merge_output_format': 'mp4',
                'outtmpl': output_template,
                'progress_hooks': [lambda d: progress_hook(d, task_id)],
                'postprocessor_hooks': [postprocessor_hook],
                'quiet': True,
                'no_warnings': True,
                'nocheckcertificate': True,
                'outtmpl_na_placeholder': 'NA',
                'hls_prefer_native': True,
                'retries': 10,
                'fragment_retries': 10
            }

        if FFMPEG_DIR:
            ydl_opts['ffmpeg_location'] = FFMPEG_DIR

        if platform_info['id'] != 'youtube':
            ydl_opts['http_headers'] = {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
            }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            title = info.get('title', 'Downloaded Media')
            
            if format_type == "mp3":
                filename_base = ydl.prepare_filename(info)
                filename = os.path.splitext(filename_base)[0] + '.mp3'
            else:
                filename = ydl.prepare_filename(info)
                if not os.path.exists(filename):
                    alt_mp4 = os.path.splitext(filename)[0] + '.mp4'
                    if os.path.exists(alt_mp4):
                        filename = alt_mp4

            if not os.path.exists(filename) and filename_holder["filename"]:
                if os.path.exists(filename_holder["filename"]):
                    filename = filename_holder["filename"]

            final_basename = os.path.basename(filename)

            tasks[task_id].update({
                "status": "completed",
                "progress": 100.0,
                "speed": "0 MB/s",
                "eta": "0s",
                "filename": final_basename,
                "title": title,
                "filesize": os.path.getsize(filename) if os.path.exists(filename) else 0
            })

    except Exception as e:
        tasks[task_id].update({
            "status": "error",
            "error_message": str(e)
        })

@app.get("/")
def read_root():
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))

@app.get("/api/proxy_download_image")
def proxy_download_image(url: str, filename: Optional[str] = "sao_item.jpg", save_history: Optional[bool] = True):
    """Tải trực tiếp 1 ảnh về máy ngay lập tức không cần tạo background task"""
    if not url or not url.startswith("http"):
        raise HTTPException(status_code=400, detail="Invalid URL")
    headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
    }
    try:
        resp = requests.get(url, headers=headers, timeout=25)
        if resp.status_code != 200:
            raise HTTPException(status_code=400, detail="Cannot fetch image from source")
            
        safe_filename = re.sub(r'[\\/*?:"<>|]', '', filename).strip() if filename else "sao_item.jpg"
        if not safe_filename.lower().endswith(('.jpg', '.jpeg', '.png', '.webp')):
            safe_filename += '.jpg'

        filepath = os.path.join(DOWNLOAD_DIR, safe_filename)
        with open(filepath, 'wb') as f:
            f.write(resp.content)

        return FileResponse(
            path=filepath,
            filename=safe_filename,
            media_type="image/jpeg"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/info")
def get_video_info(req: InfoRequest):
    clean_url = extract_clean_url(req.url)
    if not clean_url or not clean_url.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="Vui lòng cung cấp đường dẫn URL hợp lệ bắt đầu bằng http:// hoặc https://")
    
    platform_info = detect_platform(clean_url)

    # 1. Kiểm tra bài viết Instagram (Ảnh đơn hoặc Album Carousel)
    if platform_info['id'] == 'instagram':
        shortcode = extract_instagram_shortcode(clean_url)
        if shortcode:
            ig_data = get_instagram_media_info(shortcode)
            if ig_data.get('is_image'):
                return {
                    "title": ig_data.get('title') or f"Ảnh từ Instagram [{shortcode}]",
                    "channel": ig_data.get('channel') or "Instagram User",
                    "thumbnail": ig_data.get('thumbnail') or "",
                    "duration": f"Album ({ig_data['count']} vật phẩm)" if ig_data.get('is_carousel') else "Item: 1 Photo",
                    "view_count": ig_data.get('likes') or 0,
                    "available_heights": [],
                    "platform": platform_info,
                    "clean_url": clean_url,
                    "is_image": True,
                    "is_carousel": ig_data.get('is_carousel', False),
                    "image_count": ig_data.get('count', 1),
                    "images": ig_data.get('images', [])
                }

    # 2. Kiểm tra TikTok / Douyin qua TikWM API
    if platform_info['id'] in ['tiktok', 'douyin']:
        tt_data = get_tiktok_media_info(clean_url)
        if not tt_data.get('error'):
            return {
                "title": tt_data.get('title') or f"TikTok Video [{tt_data.get('id')}]",
                "channel": tt_data.get('channel') or "TikTok Creator",
                "thumbnail": tt_data.get('thumbnail') or "",
                "duration": f"Album ({tt_data['image_count']} ảnh)" if tt_data.get('is_image') else tt_data.get('duration', 'Short Clip'),
                "view_count": tt_data.get('view_count') or 0,
                "available_heights": [] if tt_data.get('is_image') else ["HD (No Watermark)"],
                "platform": platform_info,
                "clean_url": clean_url,
                "is_image": tt_data.get('is_image', False),
                "is_carousel": tt_data.get('is_carousel', False),
                "image_count": tt_data.get('image_count', 0),
                "images": tt_data.get('images', [])
            }

    # 3. Xử lý video thông thường với yt-dlp
    ydl_opts = {
        'skip_download': True,
        'quiet': True,
        'no_warnings': True,
        'nocheckcertificate': True,
        'extract_flat': False
    }
    if platform_info['id'] != 'youtube':
        ydl_opts['http_headers'] = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
        }
    if FFMPEG_DIR:
        ydl_opts['ffmpeg_location'] = FFMPEG_DIR
    
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(clean_url, download=False)
            
            duration_sec = info.get('duration')
            if duration_sec is not None:
                duration_sec = int(duration_sec)
                hours = duration_sec // 3600
                mins = (duration_sec % 3600) // 60
                secs = duration_sec % 60
                if hours > 0:
                    duration_str = f"{hours}:{mins:02d}:{secs:02d}"
                else:
                    duration_str = f"{mins}:{secs:02d}"
            else:
                duration_str = "Live / Clip"
            
            formats_available = []
            if 'formats' in info and isinstance(info['formats'], list):
                heights = set()
                for f in info['formats']:
                    h = f.get('height')
                    if h and isinstance(h, int) and h not in heights and h in [360, 480, 720, 1080, 1440, 2160]:
                        heights.add(h)
                formats_available = sorted(list(heights), reverse=True)

            thumb = info.get('thumbnail')
            if not thumb and info.get('thumbnails'):
                thumb = info['thumbnails'][-1].get('url')

            channel = (
                info.get('uploader') 
                or info.get('channel') 
                or info.get('creator') 
                or info.get('author') 
                or platform_info['name']
            )

            return {
                "title": info.get('title') or f"Video từ {platform_info['name']}",
                "channel": channel,
                "thumbnail": thumb or "",
                "duration": duration_str,
                "view_count": info.get('view_count') or 0,
                "available_heights": formats_available,
                "platform": platform_info,
                "clean_url": clean_url,
                "is_image": False,
                "is_carousel": False,
                "image_count": 0,
                "images": []
            }
    except Exception as e:
        err_msg = str(e)
        if platform_info['id'] == 'instagram' and 'No video formats' in err_msg:
            shortcode = extract_instagram_shortcode(clean_url)
            if shortcode:
                ig_data = get_instagram_media_info(shortcode)
                if ig_data.get('is_image'):
                    return {
                        "title": ig_data.get('title') or f"Ảnh từ Instagram [{shortcode}]",
                        "channel": ig_data.get('channel') or "Instagram User",
                        "thumbnail": ig_data.get('thumbnail') or "",
                        "duration": f"Album ({ig_data['count']} vật phẩm)" if ig_data.get('is_carousel') else "Item: 1 Photo",
                        "view_count": ig_data.get('likes') or 0,
                        "available_heights": [],
                        "platform": platform_info,
                        "clean_url": clean_url,
                        "is_image": True,
                        "is_carousel": ig_data.get('is_carousel', False),
                        "image_count": ig_data.get('count', 1),
                        "images": ig_data.get('images', [])
                    }

        raise HTTPException(status_code=400, detail=f"Không thể phân tích nội dung: {err_msg}")

@app.post("/api/download")
def start_download(req: DownloadRequest):
    clean_url = extract_clean_url(req.url)
    if not clean_url or not clean_url.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="Vui lòng cung cấp đường dẫn URL hợp lệ")
    
    task_id = str(uuid.uuid4())
    tasks[task_id] = {
        "task_id": task_id,
        "status": "queued",
        "progress": 0.0,
        "speed": "Initializing...",
        "eta": "--",
        "filename": None,
        "title": "Starting...",
        "error_message": None
    }
    
    thread = threading.Thread(
        target=download_worker,
        args=(task_id, clean_url, req.format_type, req.selected_indices)
    )
    thread.daemon = True
    thread.start()
    
    return {"task_id": task_id}

@app.get("/api/progress/{task_id}")
def get_progress(task_id: str):
    if task_id not in tasks:
        raise HTTPException(status_code=404, detail="Task ID không tồn tại")
    return tasks[task_id]

@app.get("/api/files/{filename}")
def download_file(filename: str):
    filepath = os.path.join(DOWNLOAD_DIR, filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="File không tồn tại")
    return FileResponse(filepath, media_type="application/octet-stream", filename=filename)

@app.get("/api/downloads_list")
def list_downloads():
    files = []
    if os.path.exists(DOWNLOAD_DIR):
        for f in os.listdir(DOWNLOAD_DIR):
            fp = os.path.join(DOWNLOAD_DIR, f)
            if os.path.isfile(fp) and not f.startswith('.'):
                stat = os.stat(fp)
                ext = f.lower().split('.')[-1] if '.' in f else ''
                is_audio = ext in ['mp3', 'wav', 'aac', 'm4a', 'flac']
                is_image = ext in ['jpg', 'jpeg', 'png', 'webp']
                is_zip = ext == 'zip'
                
                files.append({
                    "filename": f,
                    "size_mb": round(stat.st_size / (1024 * 1024), 2),
                    "created_at": time.strftime("%d/%m/%Y %H:%M", time.localtime(stat.st_mtime)),
                    "is_audio": is_audio,
                    "is_image": is_image,
                    "is_zip": is_zip
                })
    files.sort(key=lambda x: x["created_at"], reverse=True)
    return files

TRASH_DIR = os.path.join(DOWNLOAD_DIR, ".trash")
os.makedirs(TRASH_DIR, exist_ok=True)

class UndoDeleteRequest(BaseModel):
    filename: Optional[str] = None
    all: bool = False

@app.delete("/api/files/{filename}")
def delete_file(filename: str):
    filepath = os.path.join(DOWNLOAD_DIR, filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="File không tồn tại trong kho lưu trữ")
    try:
        os.makedirs(TRASH_DIR, exist_ok=True)
        trash_path = os.path.join(TRASH_DIR, filename)
        if os.path.exists(trash_path):
            os.remove(trash_path)
        shutil.move(filepath, trash_path)
        return {"success": True, "message": f"Đã chuyển {filename} vào bộ nhớ tạm", "filename": filename}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Không thể xoá file: {str(e)}")

@app.delete("/api/downloads_clear")
def clear_all_downloads():
    deleted_files = []
    os.makedirs(TRASH_DIR, exist_ok=True)
    if os.path.exists(DOWNLOAD_DIR):
        for f in os.listdir(DOWNLOAD_DIR):
            if not f.startswith('.'):
                fp = os.path.join(DOWNLOAD_DIR, f)
                if os.path.isfile(fp):
                    try:
                        dst = os.path.join(TRASH_DIR, f)
                        if os.path.exists(dst):
                            os.remove(dst)
                        shutil.move(fp, dst)
                        deleted_files.append(f)
                    except Exception:
                        pass
    return {"success": True, "deleted_count": len(deleted_files), "deleted_files": deleted_files}

@app.post("/api/files/undo")
def undo_delete(req: UndoDeleteRequest):
    if not os.path.exists(TRASH_DIR):
        return {"success": False, "message": "Không có dữ liệu trong bộ nhớ tạm để hoàn tác."}
    
    restored = []
    if req.all:
        for f in os.listdir(TRASH_DIR):
            if not f.startswith('.'):
                src = os.path.join(TRASH_DIR, f)
                dst = os.path.join(DOWNLOAD_DIR, f)
                if os.path.isfile(src):
                    try:
                        if os.path.exists(dst):
                            os.remove(dst)
                        shutil.move(src, dst)
                        restored.append(f)
                    except Exception:
                        pass
        return {"success": True, "restored": restored, "count": len(restored)}
    elif req.filename:
        src = os.path.join(TRASH_DIR, req.filename)
        dst = os.path.join(DOWNLOAD_DIR, req.filename)
        if os.path.exists(src):
            if os.path.exists(dst):
                os.remove(dst)
            shutil.move(src, dst)
            return {"success": True, "restored": [req.filename]}
        else:
            raise HTTPException(status_code=404, detail="File không còn trong bộ nhớ tạm để hoàn tác.")
    return {"success": False, "message": "Yêu cầu hoàn tác không hợp lệ"}

@app.post("/api/files/cleanup_trash")
def cleanup_trash():
    count = 0
    if os.path.exists(TRASH_DIR):
        for f in os.listdir(TRASH_DIR):
            if not f.startswith('.'):
                fp = os.path.join(TRASH_DIR, f)
                if os.path.isfile(fp):
                    try:
                        os.remove(fp)
                        count += 1
                    except Exception:
                        pass
    return {"success": True, "cleaned_count": count}

