document.addEventListener('DOMContentLoaded', () => {
    // UI Elements
    const videoUrlInput = document.getElementById('videoUrlInput');
    const inputPlatformIcon = document.getElementById('inputPlatformIcon');
    const clearUrlBtn = document.getElementById('clearUrlBtn');
    const pasteBtn = document.getElementById('pasteBtn');
    const fetchInfoBtn = document.getElementById('fetchInfoBtn');
    const urlError = document.getElementById('urlError');
    const errorText = document.getElementById('errorText');

    const clearAllHistoryBtn = document.getElementById('clearAllHistoryBtn');
    const historyCountBadge = document.getElementById('historyCountBadge');

    const saoPills = document.querySelectorAll('.sao-pill');

    const loadingSkeleton = document.getElementById('loadingSkeleton');
    const videoInfoCard = document.getElementById('videoInfoCard');
    const videoThumbnail = document.getElementById('videoThumbnail');
    const videoDuration = document.getElementById('videoDuration');
    const videoTitle = document.getElementById('videoTitle');
    const videoChannel = document.getElementById('videoChannel');
    const platformBadge = document.getElementById('platformBadge');
    const mediaTypeBadge = document.getElementById('mediaTypeBadge');
    const viewCountTag = document.getElementById('viewCountTag');
    const viewCount = document.getElementById('viewCount');

    // Video Format Section
    const videoFormatSection = document.getElementById('videoFormatSection');
    const saoChips = document.querySelectorAll('.sao-chip');
    const startDownloadBtn = document.getElementById('startDownloadBtn');

    // Photo Inventory / Selector Section
    const photoSelectorSection = document.getElementById('photoSelectorSection');
    const photoGrid = document.getElementById('photoGrid');
    const selectedCount = document.getElementById('selectedCount');
    const totalPhotosCount = document.getElementById('totalPhotosCount');
    const selectAllPhotosBtn = document.getElementById('selectAllPhotosBtn');
    const deselectAllPhotosBtn = document.getElementById('deselectAllPhotosBtn');
    const downloadSelectedBtn = document.getElementById('downloadSelectedBtn');

    // Lightbox Modal
    const imageLightboxModal = document.getElementById('imageLightboxModal');
    const modalBackdrop = document.getElementById('modalBackdrop');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const lightboxImg = document.getElementById('lightboxImg');
    const modalImgIndex = document.getElementById('modalImgIndex');
    const modalDownloadBtn = document.getElementById('modalDownloadBtn');

    // Progress & Completed Cards
    const progressCard = document.getElementById('progressCard');
    const progressBar = document.getElementById('progressBar');
    const progressPercent = document.getElementById('progressPercent');
    const downloadSpeed = document.getElementById('downloadSpeed');
    const downloadEta = document.getElementById('downloadEta');

    const completedCard = document.getElementById('completedCard');
    const completedFileName = document.getElementById('completedFileName');
    const directDownloadLink = document.getElementById('directDownloadLink');
    const downloadAnotherBtn = document.getElementById('downloadAnotherBtn');

    const refreshHistoryBtn = document.getElementById('refreshHistoryBtn');
    const downloadsHistoryList = document.getElementById('downloadsHistoryList');

    // Bottom Undo Toast Elements
    const saoUndoToast = document.getElementById('saoUndoToast');
    const toastMsg = document.getElementById('toastMsg');
    const toastUndoBtn = document.getElementById('toastUndoBtn');
    const toastCountdown = document.getElementById('toastCountdown');
    const toastCloseBtn = document.getElementById('toastCloseBtn');
    const toastProgressFill = document.getElementById('toastProgressFill');

    let undoTimer = null;
    let undoCountdownInterval = null;
    let currentUndoPayload = null;

    let currentCleanUrl = '';
    let selectedFormat = 'best';
    let pollInterval = null;
    let currentMediaData = null;
    let selectedImageIndices = new Set();

    // Smart URL extractor
    function extractUrl(text) {
        if (!text) return '';
        const match = text.match(/https?:\/\/[^\s<>"')]+/i);
        if (match) {
            return match[0].replace(/[.,;!?]+$/, '');
        }
        return text.trim();
    }

    // Platform detector
    function detectPlatform(url) {
        const u = (url || '').toLowerCase();
        if (u.includes('instagram.com') || u.includes('instagr.am')) {
            return { id: 'instagram', name: 'INSTAGRAM', icon: 'fa-brands fa-instagram', color: '#e1306c' };
        }
        if (u.includes('youtube.com') || u.includes('youtu.be')) {
            return { id: 'youtube', name: 'YOUTUBE', icon: 'fa-brands fa-youtube', color: '#ff0000' };
        }
        if (u.includes('tiktok.com')) {
            return { id: 'tiktok', name: 'TIKTOK', icon: 'fa-brands fa-tiktok', color: '#00f2fe' };
        }
        if (u.includes('douyin.com') || u.includes('iesdouyin.com')) {
            return { id: 'douyin', name: 'DOUYIN', icon: 'fa-solid fa-music', color: '#fe2c55' };
        }
        if (u.includes('facebook.com') || u.includes('fb.watch') || u.includes('fb.com')) {
            return { id: 'facebook', name: 'FACEBOOK', icon: 'fa-brands fa-facebook', color: '#1877f2' };
        }
        if (u.includes('twitter.com') || u.includes('x.com') || u.includes('t.co')) {
            return { id: 'x', name: 'X / TWITTER', icon: 'fa-brands fa-x-twitter', color: '#ffffff' };
        }
        if (u.startsWith('http://') || u.startsWith('https://')) {
            return { id: 'other', name: 'WEB MEDIA', icon: 'fa-solid fa-globe', color: '#00f0ff' };
        }
        return null;
    }

    // Update Platform Indicator
    function updatePlatformIndicator(url) {
        const platform = detectPlatform(url);
        
        saoPills.forEach(pill => {
            if (platform && pill.getAttribute('data-platform') === platform.id) {
                pill.classList.add('active');
            } else {
                pill.classList.remove('active');
            }
        });

        if (platform) {
            inputPlatformIcon.innerHTML = `<i class="${platform.icon}"></i>`;
            inputPlatformIcon.style.color = platform.color;
        } else {
            inputPlatformIcon.innerHTML = `<i class="fa-solid fa-crosshairs"></i>`;
            inputPlatformIcon.style.color = 'var(--sao-cyan)';
        }
    }

    function updateClearButton() {
        if (clearUrlBtn) {
            if (videoUrlInput.value.trim().length > 0) {
                clearUrlBtn.classList.remove('hidden');
            } else {
                clearUrlBtn.classList.add('hidden');
            }
        }
    }

    // Input events
    videoUrlInput.addEventListener('input', () => {
        const clean = extractUrl(videoUrlInput.value);
        updatePlatformIndicator(clean);
        updateClearButton();
        hideError();
    });

    if (clearUrlBtn) {
        clearUrlBtn.addEventListener('click', () => {
            videoUrlInput.value = '';
            currentCleanUrl = '';
            updatePlatformIndicator('');
            updateClearButton();
            hideError();
            videoUrlInput.focus();
        });
    }

    saoPills.forEach(pill => {
        pill.addEventListener('click', () => {
            videoUrlInput.focus();
        });
    });

    // Paste Clipboard
    pasteBtn.addEventListener('click', async () => {
        try {
            const text = await navigator.clipboard.readText();
            if (text) {
                const clean = extractUrl(text);
                videoUrlInput.value = clean || text.trim();
                updatePlatformIndicator(clean);
                updateClearButton();
                hideError();
                fetchVideoInfo();
            }
        } catch (err) {
            console.error("Clipboard paste error:", err);
            showError("Vui lòng dán thủ công bằng phím Ctrl+V hoặc Cmd+V.");
        }
    });

    // Video format chips
    saoChips.forEach(chip => {
        chip.addEventListener('click', () => {
            saoChips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            selectedFormat = chip.getAttribute('data-format');
        });
    });

    // Enter Key
    videoUrlInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            fetchVideoInfo();
        }
    });

    fetchInfoBtn.addEventListener('click', fetchVideoInfo);

    function showError(msg) {
        errorText.textContent = msg;
        urlError.classList.remove('hidden');
    }

    function hideError() {
        urlError.classList.add('hidden');
    }

    // Fetch Video/Media Info
    async function fetchVideoInfo() {
        const rawInput = videoUrlInput.value.trim();
        if (!rawInput) {
            showError("Vui lòng nhập liên kết mục tiêu (Instagram, YouTube, TikTok...)!");
            return;
        }

        const cleanUrl = extractUrl(rawInput);
        if (!cleanUrl || !cleanUrl.startsWith('http')) {
            showError("URL không hợp lệ. Vui lòng nhập liên kết bắt đầu bằng http:// hoặc https://!");
            return;
        }

        hideError();
        currentCleanUrl = cleanUrl;
        videoUrlInput.value = cleanUrl;
        updatePlatformIndicator(cleanUrl);
        updateClearButton();

        // UI Reset
        videoInfoCard.classList.add('hidden');
        progressCard.classList.add('hidden');
        completedCard.classList.add('hidden');
        loadingSkeleton.classList.remove('hidden');

        try {
            const res = await fetch('/api/info', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: cleanUrl })
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.detail || 'Lỗi khi trích xuất dữ liệu. Vui lòng thử lại!');
            }

            const data = await res.json();
            currentMediaData = data;
            loadingSkeleton.classList.add('hidden');

            // Render basic media details
            videoThumbnail.src = data.thumbnail || '/static/sao_logo.jpg';
            videoTitle.textContent = data.title;
            videoChannel.innerHTML = `<i class="fa-solid fa-circle-user"></i> ${data.channel}`;
            videoDuration.textContent = data.duration;

            // Platform badge
            const pf = data.platform || detectPlatform(cleanUrl) || { name: 'WEB MEDIA', icon: 'fa-solid fa-globe' };
            platformBadge.innerHTML = `<i class="${pf.icon}"></i> <span>${pf.name}</span>`;

            // Media Type & Selective Rendering
            if (data.is_image) {
                mediaTypeBadge.className = 'sao-badge media-type';
                mediaTypeBadge.innerHTML = `<i class="fa-solid fa-images"></i> <span>${data.is_carousel ? 'INVENTORY ALBUM' : 'SINGLE PHOTO'}</span>`;

                // Hide video formats, Show photo inventory grid
                videoFormatSection.classList.add('hidden');
                photoSelectorSection.classList.remove('hidden');

                renderPhotoInventory(data.images || []);

            } else {
                mediaTypeBadge.className = 'sao-badge media-type video';
                mediaTypeBadge.innerHTML = `<i class="fa-solid fa-film"></i> <span>VIDEO STREAM</span>`;

                // Show video formats, Hide photo inventory grid
                videoFormatSection.classList.remove('hidden');
                photoSelectorSection.classList.add('hidden');

                saoChips.forEach(c => c.classList.remove('active'));
                const bestChip = document.querySelector('.sao-chip[data-format="best"]');
                if (bestChip) {
                    bestChip.classList.add('active');
                    selectedFormat = 'best';
                }
            }

            // View count / likes
            if (data.view_count && data.view_count > 0) {
                viewCountTag.classList.remove('hidden');
                viewCount.textContent = Number(data.view_count).toLocaleString('vi-VN') + (data.is_image ? ' LƯỢT THÍCH' : ' LƯỢT XEM');
            } else {
                viewCountTag.classList.add('hidden');
            }

            videoInfoCard.classList.remove('hidden');

        } catch (err) {
            loadingSkeleton.classList.add('hidden');
            showError(err.message);
        }
    }

    // Render SAO Photo Inventory Grid with Selection Controls
    function renderPhotoInventory(images) {
        selectedImageIndices.clear();
        photoGrid.innerHTML = '';
        totalPhotosCount.textContent = images.length;

        // Default: Select all images initially
        images.forEach(img => {
            selectedImageIndices.add(img.index);
        });
        updateSelectedCounter();

        images.forEach(img => {
            const card = document.createElement('div');
            card.className = 'sao-photo-card selected';
            card.setAttribute('data-index', img.index);

            card.innerHTML = `
                <div class="sao-checkbox-wrap">
                    <div class="sao-custom-check">
                        <i class="fa-solid fa-check"></i>
                    </div>
                </div>
                <div class="slot-tag">#${String(img.index).padStart(2, '0')}</div>
                <div class="card-img-holder">
                    <img src="${img.url}" alt="Item #${img.index}" loading="lazy">
                </div>
                <div class="card-quick-actions">
                    <button type="button" class="card-action-btn view-btn" title="Xem ảnh lớn">
                        <i class="fa-solid fa-expand"></i> <span>XEM</span>
                    </button>
                    <a href="/api/proxy_download_image?url=${encodeURIComponent(img.url)}&filename=SAO_Item_${img.index}.jpg" class="card-action-btn download-btn" download="SAO_Item_${img.index}.jpg" title="Lưu ngay về máy">
                        <i class="fa-solid fa-download"></i> <span>TẢI</span>
                    </a>
                </div>
            `;

            // Toggle selection when clicking on card image or checkbox
            const imgHolder = card.querySelector('.card-img-holder');
            const checkWrap = card.querySelector('.sao-checkbox-wrap');

            const toggleSelect = (e) => {
                e.stopPropagation();
                if (selectedImageIndices.has(img.index)) {
                    selectedImageIndices.delete(img.index);
                    card.classList.remove('selected');
                } else {
                    selectedImageIndices.add(img.index);
                    card.classList.add('selected');
                }
                updateSelectedCounter();
            };

            imgHolder.addEventListener('click', toggleSelect);
            checkWrap.addEventListener('click', toggleSelect);

            // Lightbox View
            const viewBtn = card.querySelector('.view-btn');
            viewBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                openLightbox(img.url, img.index);
            });

            // Prevent card toggle on direct download click
            const downloadBtn = card.querySelector('.download-btn');
            downloadBtn.addEventListener('click', (e) => {
                e.stopPropagation();
            });

            photoGrid.appendChild(card);
        });
    }

    function updateSelectedCounter() {
        const count = selectedImageIndices.size;
        selectedCount.textContent = count;

        if (count === 0) {
            downloadSelectedBtn.classList.add('sao-btn-dim');
            downloadSelectedBtn.innerHTML = `<i class="fa-solid fa-file-zipper"></i> <span>CHƯA CHỌN ẢNH NÀO</span>`;
        } else if (count === 1) {
            downloadSelectedBtn.classList.remove('sao-btn-dim');
            downloadSelectedBtn.innerHTML = `<i class="fa-solid fa-download"></i> <span>TẢI 1 ẢNH ĐÃ CHỌN (.JPG)</span>`;
        } else {
            downloadSelectedBtn.classList.remove('sao-btn-dim');
            downloadSelectedBtn.innerHTML = `<i class="fa-solid fa-file-zipper"></i> <span>TẢI ${count} ẢNH ĐÃ CHỌN (.ZIP)</span>`;
        }
    }

    // Select All / Deselect All
    selectAllPhotosBtn.addEventListener('click', () => {
        if (!currentMediaData || !currentMediaData.images) return;
        currentMediaData.images.forEach(img => selectedImageIndices.add(img.index));
        document.querySelectorAll('.sao-photo-card').forEach(card => card.classList.add('selected'));
        updateSelectedCounter();
    });

    deselectAllPhotosBtn.addEventListener('click', () => {
        selectedImageIndices.clear();
        document.querySelectorAll('.sao-photo-card').forEach(card => card.classList.remove('selected'));
        updateSelectedCounter();
    });

    // Download Selected Images
    downloadSelectedBtn.addEventListener('click', () => {
        if (selectedImageIndices.size === 0) {
            showError("Vui lòng chọn ít nhất 1 ảnh để tải về!");
            return;
        }

        const indices = Array.from(selectedImageIndices);
        executeDownload({
            url: currentCleanUrl,
            format_type: indices.length === 1 ? 'image_original' : 'image_selected',
            selected_indices: indices
        });
    });

    // Video Download Button
    startDownloadBtn.addEventListener('click', () => {
        if (!currentCleanUrl) return;
        executeDownload({
            url: currentCleanUrl,
            format_type: selectedFormat
        });
    });

    // Core Download Request & Polling
    async function executeDownload(payload) {
        videoInfoCard.classList.add('hidden');
        progressCard.classList.remove('hidden');
        
        progressBar.style.width = '0%';
        progressPercent.textContent = '0%';
        downloadSpeed.textContent = 'INITIALIZING VR STREAM...';
        downloadEta.textContent = '--';

        try {
            const res = await fetch('/api/download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.detail || 'Không thể bắt đầu tác vụ tải về');
            }

            const data = await res.json();
            const taskId = data.task_id;

            // Start polling
            pollProgress(taskId);

        } catch (err) {
            progressCard.classList.add('hidden');
            showError(err.message);
        }
    }

    function pollProgress(taskId) {
        if (pollInterval) clearInterval(pollInterval);

        pollInterval = setInterval(async () => {
            try {
                const res = await fetch(`/api/progress/${taskId}`);
                if (!res.ok) return;

                const data = await res.json();
                
                if (data.status === 'downloading' || data.status === 'processing') {
                    const percent = data.progress || 0;
                    progressBar.style.width = `${percent}%`;
                    progressPercent.textContent = `${percent}%`;
                    downloadSpeed.textContent = data.speed || 'TRANSMITTING...';
                    downloadEta.textContent = data.eta || '--';
                } else if (data.status === 'completed') {
                    clearInterval(pollInterval);
                    progressCard.classList.add('hidden');
                    
                    completedFileName.textContent = data.filename;
                    directDownloadLink.href = `/api/files/${encodeURIComponent(data.filename)}`;
                    completedCard.classList.remove('hidden');

                    loadHistory();
                } else if (data.status === 'error') {
                    clearInterval(pollInterval);
                    progressCard.classList.add('hidden');
                    showError(`Lỗi khi trích xuất: ${data.error_message || 'Không xác định'}`);
                }
            } catch (err) {
                console.error("Poll progress error:", err);
            }
        }, 750);
    }

    // Lightbox Controls
    function openLightbox(url, idx) {
        lightboxImg.src = url;
        modalImgIndex.textContent = `#${String(idx).padStart(2, '0')}`;
        modalDownloadBtn.href = `/api/proxy_download_image?url=${encodeURIComponent(url)}&filename=SAO_Item_${idx}.jpg`;
        modalDownloadBtn.setAttribute('download', `SAO_Item_${idx}.jpg`);
        imageLightboxModal.classList.remove('hidden');
    }

    function closeLightbox() {
        imageLightboxModal.classList.add('hidden');
        lightboxImg.src = '';
    }

    closeModalBtn.addEventListener('click', closeLightbox);
    modalBackdrop.addEventListener('click', closeLightbox);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeLightbox();
    });

    // Reset to download another
    downloadAnotherBtn.addEventListener('click', () => {
        completedCard.classList.add('hidden');
        videoUrlInput.value = '';
        currentCleanUrl = '';
        updatePlatformIndicator('');
        updateClearButton();
        videoUrlInput.focus();
    });

    // Toast Management (10s Undo countdown)
    function showUndoToast(payload) {
        if (undoTimer) clearTimeout(undoTimer);
        if (undoCountdownInterval) clearInterval(undoCountdownInterval);

        currentUndoPayload = payload;
        let seconds = 10;

        if (toastMsg) {
            toastMsg.textContent = payload.text || 'Đã xoá mục khỏi kho lưu trữ.';
        }
        if (toastCountdown) {
            toastCountdown.textContent = `${seconds}s`;
        }

        if (toastProgressFill) {
            toastProgressFill.style.transition = 'none';
            toastProgressFill.style.width = '100%';
            void toastProgressFill.offsetWidth; // trigger reflow
            toastProgressFill.style.transition = 'width 10s linear';
            toastProgressFill.style.width = '0%';
        }

        if (saoUndoToast) {
            saoUndoToast.classList.remove('hidden');
        }

        undoCountdownInterval = setInterval(() => {
            seconds--;
            if (toastCountdown) {
                toastCountdown.textContent = `${seconds}s`;
            }
            if (seconds <= 0) {
                dismissUndoToast(true);
            }
        }, 1000);
    }
    window.showUndoToast = showUndoToast;

    function dismissUndoToast(shouldCleanup = false) {
        if (undoTimer) clearTimeout(undoTimer);
        if (undoCountdownInterval) clearInterval(undoCountdownInterval);
        undoTimer = null;
        undoCountdownInterval = null;

        if (saoUndoToast) {
            saoUndoToast.classList.add('hidden');
        }

        if (shouldCleanup) {
            fetch('/api/files/cleanup_trash', { method: 'POST' }).catch(() => {});
        }
    }

    if (toastCloseBtn) {
        toastCloseBtn.addEventListener('click', () => {
            dismissUndoToast(true);
        });
    }

    if (toastUndoBtn) {
        toastUndoBtn.addEventListener('click', async () => {
            if (!currentUndoPayload) return;
            const payload = currentUndoPayload;
            dismissUndoToast(false);

            try {
                const res = await fetch('/api/files/undo', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if (res.ok) {
                    await loadHistory();
                    setAsunaSpeech("Đã hoàn tác và khôi phục vật phẩm thành công! ✨");
                } else {
                    const err = await res.json();
                    console.error("Undo error:", err);
                }
            } catch (e) {
                console.error("Undo request failed:", e);
            }
        });
    }

    // Clear All History Button (Bấm là xoá luôn, có nút Hoàn tác 10s bên dưới)
    if (clearAllHistoryBtn) {
        clearAllHistoryBtn.addEventListener('click', async () => {
            try {
                const res = await fetch('/api/downloads_clear', { method: 'DELETE' });
                if (res.ok) {
                    await loadHistory();
                    showUndoToast({ all: true, text: "Đã xoá toàn bộ kho lưu trữ." });
                    setAsunaSpeech("Đã dọn dẹp kho lưu trữ! Bạn có 10 giây để bấm HOÀN TÁC ở thanh bên dưới.");
                }
            } catch (e) {
                console.error("Clear all error:", e);
            }
        });
    }

    // Load History
    refreshHistoryBtn.addEventListener('click', loadHistory);

    // SAO Menu Tabs Navigation
    const saoMenuTabs = document.querySelectorAll('.sao-menu-tab');
    const tabInventoryCounter = document.getElementById('tabInventoryCounter');
    let cachedHistoryFiles = [];
    let currentHistoryFilter = 'all';

    saoMenuTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            saoMenuTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            playSaoSound('click');

            const targetId = tab.getAttribute('data-target');
            if (targetId) {
                const targetEl = document.getElementById(targetId);
                if (targetEl) {
                    targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    // Visual pulse focus
                    targetEl.style.boxShadow = '0 0 35px var(--sao-cyan)';
                    setTimeout(() => {
                        targetEl.style.boxShadow = '';
                    }, 1200);
                }
            }
        });
    });

    // Inventory Category Filter Chips
    const invFilterChips = document.querySelectorAll('.inv-filter-chip');
    invFilterChips.forEach(chip => {
        chip.addEventListener('click', () => {
            invFilterChips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            currentHistoryFilter = chip.getAttribute('data-filter') || 'all';
            playSaoSound('click');
            renderHistoryItems();
        });
    });

    // Load History
    refreshHistoryBtn.addEventListener('click', loadHistory);

    async function loadHistory() {
        try {
            const res = await fetch('/api/downloads_list');
            if (!res.ok) return;

            cachedHistoryFiles = await res.json();
            
            if (historyCountBadge) {
                historyCountBadge.textContent = `${cachedHistoryFiles.length} ITEMS`;
            }
            if (tabInventoryCounter) {
                tabInventoryCounter.textContent = cachedHistoryFiles.length;
            }

            renderHistoryItems();

        } catch (err) {
            console.error("Load history error:", err);
        }
    }

    function renderHistoryItems() {
        if (!downloadsHistoryList) return;

        let filtered = cachedHistoryFiles;
        if (currentHistoryFilter === 'video') {
            filtered = cachedHistoryFiles.filter(f => !f.is_image && !f.is_zip && !f.is_audio);
        } else if (currentHistoryFilter === 'image') {
            filtered = cachedHistoryFiles.filter(f => f.is_image || f.is_zip);
        } else if (currentHistoryFilter === 'audio') {
            filtered = cachedHistoryFiles.filter(f => f.is_audio);
        }

        if (filtered.length === 0) {
            downloadsHistoryList.innerHTML = `<div class="empty-inventory">NO ITEMS FOUND IN "${currentHistoryFilter.toUpperCase()}" // KHO TRỐNG.</div>`;
            return;
        }

        downloadsHistoryList.innerHTML = filtered.map(file => {
            let iconType = 'video';
            let iconClass = 'fa-film';

            if (file.is_image) {
                iconType = 'image';
                iconClass = 'fa-image';
            } else if (file.is_zip) {
                iconType = 'zip';
                iconClass = 'fa-file-zipper';
            } else if (file.is_audio) {
                iconType = 'audio';
                iconClass = 'fa-music';
            }

            return `
                <div class="sao-history-item">
                    <div class="file-info-group">
                        <div class="file-icon ${iconType}">
                            <i class="fa-solid ${iconClass}"></i>
                        </div>
                        <div class="file-details">
                            <div class="file-title" title="${file.filename}">${file.filename}</div>
                            <div class="file-meta">${file.size_mb} MB • ${file.created_at} • [LOCAL ARCHIVE]</div>
                        </div>
                    </div>
                    <div class="sao-history-actions">
                        <a href="/api/files/${encodeURIComponent(file.filename)}" class="sao-btn sao-btn-secondary sao-btn-xs" download title="Lưu về máy">
                            <i class="fa-solid fa-download"></i> <span>SAVE</span>
                        </a>
                        <button type="button" class="sao-btn-del" data-filename="${file.filename}" title="Xoá file này khỏi lịch sử">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        // Attach delete listener to each item button (BẤM LÀ XOÁ LUÔN, KHÔNG DÙNG CONFIRM GÂY NHÁY)
        downloadsHistoryList.querySelectorAll('.sao-btn-del').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const fn = btn.getAttribute('data-filename');
                if (!fn) return;

                try {
                    btn.disabled = true;
                    playSaoSound('delete');
                    const dRes = await fetch(`/api/files/${encodeURIComponent(fn)}`, { method: 'DELETE' });
                    if (dRes.ok) {
                        await loadHistory();
                        showUndoToast({ filename: fn, text: `Đã xoá "${fn}"` });
                        setAsunaSpeech(`Đã xoá "${fn}"! Bạn có 10 giây để bấm HOÀN TÁC bên dưới.`);
                    } else {
                        const err = await dRes.json();
                        console.error("Delete error:", err);
                    }
                } catch (e) {
                    console.error("Delete error:", e);
                }
            });
        });
    }

    // Asuna Companion & Speech Bubble Logic
    const asunaCompanion = document.getElementById('asunaCompanion');
    const asunaSpeechBubble = document.getElementById('asunaSpeechBubble');
    const asunaSpeechText = document.getElementById('asunaSpeechText');
    const asunaMascotTrigger = document.getElementById('asunaMascotTrigger');
    const asunaChips = document.querySelectorAll('.asuna-chip');

    const asunaQuotes = [
        "Link Start! Asuna sẵn sàng hỗ trợ bạn trích xuất video & ảnh album chất lượng gốc!",
        "Món sandwich tớ làm cho Kirito có độ thuần thục nấu ăn 100% đấy nhé! 🥪",
        "Tốc độ giải mã này ngang ngửa kiếm kỹ 'Linear' của tớ rồi! ⚡",
        "Nếu gặp bài viết riêng tư, hãy chắc chắn rằng bạn có quyền truy cập nhé!",
        "Dù ở Aincrad hay thế giới thực, tớ sẽ luôn đồng hành cùng bạn! ✨",
        "Vật phẩm sau khi tải sẽ được lưu trữ nguyên bản an toàn trong hệ thống."
    ];

    function setAsunaSpeech(text) {
        if (!asunaSpeechText) return;
        asunaSpeechText.textContent = text;
        if (asunaSpeechBubble) {
            asunaSpeechBubble.style.opacity = '1';
        }
    }

    if (asunaMascotTrigger) {
        asunaMascotTrigger.addEventListener('click', () => {
            const randomQuote = asunaQuotes[Math.floor(Math.random() * asunaQuotes.length)];
            setAsunaSpeech(randomQuote);
        });
    }

    // Asuna Form Switcher (Theme Shifts)
    asunaChips.forEach(chip => {
        chip.addEventListener('click', () => {
            asunaChips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            const form = chip.getAttribute('data-form');

            document.body.classList.remove('theme-kob', 'theme-stacia', 'theme-undine');
            if (form === 'stacia') {
                document.body.classList.add('theme-stacia');
                setAsunaSpeech("Sáng Thế Thần Stacia đã giáng lâm! Hệ thống chuyển sang giao diện Thánh Quang Ánh Kim! ✨");
            } else if (form === 'undine') {
                document.body.classList.add('theme-undine');
                setAsunaSpeech("Thủy Tộc Undine Asuna đã kích hoạt ma pháp hỗ trợ Lam Thủy tốc độ cao! 💧");
            } else {
                document.body.classList.add('theme-kob');
                setAsunaSpeech("Phó Đoàn Trưởng Huyết Minh Kỵ Sĩ Đoàn (The Flash) sẵn sàng xung trận với Kiếm Kỹ Huyết Sắc! ⚔️");
            }
        });
    });

    // ==========================================
    // 1. SAO AUDIO SYNTHESIZER (Pure Web Audio API)
    // ==========================================
    let audioCtx = null;
    let sfxEnabled = true;

    function initAudio() {
        if (!audioCtx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) {
                audioCtx = new AudioContext();
            }
        }
        if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
    }

    function playSaoSound(type = 'click') {
        if (!sfxEnabled) return;
        try {
            initAudio();
            if (!audioCtx) return;

            const now = audioCtx.currentTime;
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);

            if (type === 'click') {
                // High-tech SAO crystal ping
                osc.type = 'sine';
                osc.frequency.setValueAtTime(1400, now);
                osc.frequency.exponentialRampToValueAtTime(1850, now + 0.05);
                gain.gain.setValueAtTime(0.12, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
                osc.start(now);
                osc.stop(now + 0.07);
            } else if (type === 'slash') {
                // Sword slash whoosh / Linear thrust
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(880, now);
                osc.frequency.exponentialRampToValueAtTime(160, now + 0.16);
                gain.gain.setValueAtTime(0.22, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
                osc.start(now);
                osc.stop(now + 0.16);
            } else if (type === 'login') {
                // Link Start Arpeggio (C5, E5, G5, C6)
                const freqs = [523.25, 659.25, 783.99, 1046.50];
                freqs.forEach((freq, idx) => {
                    const o = audioCtx.createOscillator();
                    const g = audioCtx.createGain();
                    o.type = 'sine';
                    o.frequency.setValueAtTime(freq, now + idx * 0.09);
                    g.gain.setValueAtTime(0.14, now + idx * 0.09);
                    g.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.09 + 0.35);
                    o.connect(g);
                    g.connect(audioCtx.destination);
                    o.start(now + idx * 0.09);
                    o.stop(now + idx * 0.09 + 0.35);
                });
            } else if (type === 'delete') {
                // Cyber item discard
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(320, now);
                osc.frequency.exponentialRampToValueAtTime(90, now + 0.14);
                gain.gain.setValueAtTime(0.15, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
                osc.start(now);
                osc.stop(now + 0.14);
            } else if (type === 'undo') {
                // Revival chime
                [440, 660, 880].forEach((f, i) => {
                    const o = audioCtx.createOscillator();
                    const g = audioCtx.createGain();
                    o.type = 'sine';
                    o.frequency.setValueAtTime(f, now + i * 0.08);
                    g.gain.setValueAtTime(0.15, now + i * 0.08);
                    g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.4);
                    o.connect(g);
                    g.connect(audioCtx.destination);
                    o.start(now + i * 0.08);
                    o.stop(now + i * 0.08 + 0.4);
                });
            }
        } catch (e) {
            // Audio context gesture restriction handled
        }
    }

    const saoSfxToggle = document.getElementById('saoSfxToggle');
    const sfxStatusText = document.getElementById('sfxStatusText');
    if (saoSfxToggle) {
        saoSfxToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            sfxEnabled = !sfxEnabled;
            saoSfxToggle.classList.toggle('active', sfxEnabled);
            if (sfxStatusText) {
                sfxStatusText.textContent = sfxEnabled ? 'SFX: ON' : 'SFX: OFF';
            }
            if (sfxEnabled) playSaoSound('click');
        });
    }

    // ==========================================
    // 2. LINK START LOGIN SEQUENCE
    // ==========================================
    const linkStartOverlay = document.getElementById('linkStartOverlay');
    const linkStartLog = document.getElementById('linkStartLog');
    const linkStartProgress = document.getElementById('linkStartProgress');
    const skipLinkStartBtn = document.getElementById('skipLinkStartBtn');
    const reLinkStartBtn = document.getElementById('reLinkStartBtn');

    let linkStartTimeout = null;

    function runLinkStartSequence() {
        if (!linkStartOverlay) return;
        linkStartOverlay.classList.remove('dismissed');
        if (linkStartProgress) linkStartProgress.style.width = '0%';

        const steps = [
            { pct: '30%', text: 'CONNECTING TO NERVEGEAR AINCRAD SERVER...', delay: 250 },
            { pct: '65%', text: 'SYNCHRONIZING FLUID DYNAMICS // FLOOR 75...', delay: 750 },
            { pct: '95%', text: 'AUTHENTICATING: ASUNA_YUUKI [VICE COMMANDER]...', delay: 1300 },
            { pct: '100%', text: 'LINK ESTABLISHED! WELCOME TO SWORD ART ONLINE!', delay: 1800 }
        ];

        steps.forEach(step => {
            setTimeout(() => {
                if (linkStartProgress) linkStartProgress.style.width = step.pct;
                if (linkStartLog) linkStartLog.textContent = step.text;
                if (step.pct === '100%') {
                    playSaoSound('login');
                } else {
                    playSaoSound('click');
                }
            }, step.delay);
        });

        linkStartTimeout = setTimeout(() => {
            dismissLinkStart();
        }, 2500);
    }

    function dismissLinkStart() {
        if (linkStartTimeout) clearTimeout(linkStartTimeout);
        if (linkStartOverlay) {
            linkStartOverlay.classList.add('dismissed');
        }
        setAsunaSpeech("Chào mừng bạn trở lại Aincrad! Phó Đoàn Trưởng Asuna đã sẵn sàng hỗ trợ! ✨");
    }

    if (skipLinkStartBtn) {
        skipLinkStartBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            dismissLinkStart();
        });
    }

    if (reLinkStartBtn) {
        reLinkStartBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            runLinkStartSequence();
        });
    }

    // Auto run on load
    runLinkStartSequence();

    // ==========================================
    // 3. CURSOR GLOW & 3D CARD TILT ON MOUSE MOVE
    // ==========================================
    const saoCursorGlow = document.getElementById('saoCursorGlow');

    window.addEventListener('mousemove', (e) => {
        if (saoCursorGlow) {
            saoCursorGlow.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0)`;
        }
    });

    // 3D Parallax Tilt for all .sao-tilt-card elements
    const tiltCards = document.querySelectorAll('.sao-tilt-card');
    tiltCards.forEach(card => {
        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            const rotateX = ((y - centerY) / centerY) * -4;
            const rotateY = ((x - centerX) / centerX) * 4;

            card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-2px)`;
        });

        card.addEventListener('mouseleave', () => {
            card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) translateY(0)';
        });
    });

    // ==========================================
    // 4. FULLSCREEN CANVAS SWORD SLASH & CRYSTAL BURST
    // ==========================================
    const slashCanvas = document.getElementById('saoSlashCanvas');
    const ctx = slashCanvas ? slashCanvas.getContext('2d') : null;
    let particles = [];
    let slashes = [];

    function resizeCanvas() {
        if (!slashCanvas) return;
        slashCanvas.width = window.innerWidth;
        slashCanvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    function createClickBurst(x, y, isBig = false) {
        // Form-themed sword slash beam
        let beamColor = '#ff2d55';
        let colors = ['#ff2d55', '#ff4d75', '#ffffff', '#ffd0db', '#ff85a2'];
        if (document.body.classList.contains('theme-stacia')) {
            beamColor = isBig ? '#ffd700' : '#ffaa00';
            colors = ['#ffaa00', '#ffd700', '#ffffff', '#ffe066', '#ff8800'];
        } else if (document.body.classList.contains('theme-undine')) {
            beamColor = isBig ? '#38bdf8' : '#0099ff';
            colors = ['#0099ff', '#00d2ff', '#ffffff', '#38bdf8', '#0066ff'];
        }

        slashes.push({
            x, y,
            angle: (Math.random() * 0.8 - 0.4) * Math.PI,
            length: isBig ? 340 : 170,
            life: 1.0,
            decay: isBig ? 0.05 : 0.08,
            color: beamColor
        });

        // Spawn crystal shards
        const count = isBig ? 36 : 14;
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = (Math.random() * (isBig ? 10 : 5)) + 2;
            particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                size: (Math.random() * 6) + 3,
                rotation: Math.random() * Math.PI * 2,
                vRot: (Math.random() - 0.5) * 0.2,
                color: colors[Math.floor(Math.random() * colors.length)],
                life: 1.0,
                decay: (Math.random() * 0.03) + 0.02,
                shape: Math.floor(Math.random() * 3) // 0: diamond, 1: triangle, 2: hex
            });
        }
    }

    function renderSlashParticles() {
        if (!ctx) return;
        ctx.clearRect(0, 0, slashCanvas.width, slashCanvas.height);

        // Render slashes
        for (let i = slashes.length - 1; i >= 0; i--) {
            const s = slashes[i];
            ctx.save();
            ctx.translate(s.x, s.y);
            ctx.rotate(s.angle);
            ctx.globalAlpha = s.life;

            const grad = ctx.createLinearGradient(-s.length / 2, 0, s.length / 2, 0);
            grad.addColorStop(0, 'transparent');
            grad.addColorStop(0.5, '#ffffff');
            grad.addColorStop(0.7, s.color);
            grad.addColorStop(1, 'transparent');

            ctx.strokeStyle = grad;
            ctx.lineWidth = 4;
            ctx.shadowColor = s.color;
            ctx.shadowBlur = 20;

            ctx.beginPath();
            ctx.moveTo(-s.length / 2, 0);
            ctx.lineTo(s.length / 2, 0);
            ctx.stroke();

            ctx.restore();

            s.life -= s.decay;
            if (s.life <= 0) slashes.splice(i, 1);
        }

        // Render crystals
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rotation);
            ctx.globalAlpha = p.life;
            ctx.fillStyle = p.color;
            ctx.shadowColor = p.color;
            ctx.shadowBlur = 10;

            ctx.beginPath();
            if (p.shape === 0) {
                ctx.moveTo(0, -p.size);
                ctx.lineTo(p.size * 0.7, 0);
                ctx.lineTo(0, p.size);
                ctx.lineTo(-p.size * 0.7, 0);
            } else if (p.shape === 1) {
                ctx.moveTo(0, -p.size);
                ctx.lineTo(p.size, p.size);
                ctx.lineTo(-p.size, p.size);
            } else {
                for (let a = 0; a < 6; a++) {
                    const rad = (a * Math.PI) / 3;
                    const hx = Math.cos(rad) * p.size;
                    const hy = Math.sin(rad) * p.size;
                    if (a === 0) ctx.moveTo(hx, hy);
                    else ctx.lineTo(hx, hy);
                }
            }
            ctx.closePath();
            ctx.fill();
            ctx.restore();

            p.x += p.vx;
            p.y += p.vy;
            p.vx *= 0.96;
            p.vy *= 0.96;
            p.rotation += p.vRot;
            p.life -= p.decay;

            if (p.life <= 0) particles.splice(i, 1);
        }

        requestAnimationFrame(renderSlashParticles);
    }
    requestAnimationFrame(renderSlashParticles);

    // Global Click Event for Sword Slash & Crystal Burst
    document.addEventListener('click', (e) => {
        if (e.target.tagName === 'INPUT') return;
        createClickBurst(e.clientX, e.clientY, false);
        playSaoSound('click');
    });

    // Dedicated Fullscreen Sword Skill Button (Linear // Star Splash)
    const asunaSwordSkillBtn = document.getElementById('asunaSwordSkillBtn');
    if (asunaSwordSkillBtn) {
        asunaSwordSkillBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            playSaoSound('slash');

            const cx = window.innerWidth / 2;
            const cy = window.innerHeight / 2;

            for (let i = 0; i < 4; i++) {
                setTimeout(() => {
                    const ox = cx + (Math.random() * 320 - 160);
                    const oy = cy + (Math.random() * 220 - 110);
                    createClickBurst(ox, oy, true);
                    playSaoSound('slash');
                }, i * 110);
            }

            setAsunaSpeech("KIẾM KỸ: LINEAR THẦN TỐC! Toàn bộ luồng dữ liệu hệ thống đã được gia tốc tối đa! ⚡⚔️");
        });
    }

    // Initial history load
    loadHistory();
});
