/* ==========================================================================
   OPTISQUEEZE APPLICATION LOGIC
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  
  // DOM Elements
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');
  const browseBtn = document.getElementById('browse-btn');
  
  const qualitySlider = document.getElementById('quality-slider');
  const qualityValue = document.getElementById('quality-value');
  const qualityDesc = document.getElementById('quality-desc');
  const formatSelect = document.getElementById('format-select');
  const formatInfo = document.getElementById('format-info');
  const resizeSelect = document.getElementById('resize-select');
  
  const summaryCard = document.getElementById('summary-card');
  const totalOriginalSizeEl = document.getElementById('total-original-size');
  const totalCompressedSizeEl = document.getElementById('total-compressed-size');
  const totalSavingsPercentEl = document.getElementById('total-savings-percent');
  const downloadZipBtn = document.getElementById('download-zip-btn');
  const clearAllBtn = document.getElementById('clear-all-btn');
  
  const queueCount = document.getElementById('queue-count');
  const queueActionsInline = document.getElementById('queue-actions-inline');
  const recompressBtn = document.getElementById('recompress-btn');
  const emptyQueuePlaceholder = document.getElementById('empty-queue-placeholder');
  const queueGrid = document.getElementById('queue-grid');
  const toastContainer = document.getElementById('toast-container');

  // Application State
  let queue = [];
  let compressionTimeout = null;

  // Initialize Event Listeners
  initEvents();

  function initEvents() {
    // File upload triggers
    browseBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileSelect);

    // Drag and Drop
    ['dragenter', 'dragover'].forEach(eventName => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.add('dragover');
      }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove('dragover');
      }, false);
    });

    dropZone.addEventListener('drop', handleFileDrop, false);

    // Settings adjustments (Reactive Compression with debouncing)
    qualitySlider.addEventListener('input', handleQualitySliderInput);
    formatSelect.addEventListener('change', handleFormatSelectChange);
    resizeSelect.addEventListener('change', () => triggerRecompression(300));

    // Global Action Buttons
    downloadZipBtn.addEventListener('click', downloadAllAsZip);
    clearAllBtn.addEventListener('click', clearQueue);
    recompressBtn.addEventListener('click', () => triggerRecompression(0));
  }

  /* ==========================================================================
     UPLOAD & DROPPING FILES
     ========================================================================== */

  function handleFileSelect(e) {
    const files = Array.from(e.target.files);
    addFilesToQueue(files);
    fileInput.value = ''; // Reset input so same file can be selected again
  }

  function handleFileDrop(e) {
    const files = Array.from(e.dataTransfer.files);
    addFilesToQueue(files);
  }

  function addFilesToQueue(files) {
    const validImageTypes = ['image/jpeg', 'image/png', 'image/webp'];
    const addedFiles = [];

    files.forEach(file => {
      if (!validImageTypes.includes(file.type)) {
        showToast(`Unsupported format: ${file.name}. Please upload JPEG, PNG, or WebP.`, 'error');
        return;
      }
      
      const itemId = `img-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
      const queueItem = {
        id: itemId,
        file: file,
        name: file.name,
        originalSize: file.size,
        originalFormat: file.type,
        status: 'pending',
        progress: 0,
        compressedBlob: null,
        compressedSize: null,
        compressedFormat: null,
        compressedUrl: null,
        errorMessage: null
      };

      queue.push(queueItem);
      addedFiles.push(queueItem);
      
      // Render card immediately as pending
      createQueueCard(queueItem);
    });

    if (addedFiles.length > 0) {
      updateUIQueueState();
      showToast(`Added ${addedFiles.length} file(s) to queue.`, 'success');
      
      // Start processing files
      processPendingQueue();
    }
  }

  /* ==========================================================================
     UI MANAGEMENT & RENDERING
     ========================================================================== */

  function updateUIQueueState() {
    const count = queue.length;
    queueCount.textContent = `${count} file${count === 1 ? '' : 's'}`;
    
    if (count > 0) {
      emptyQueuePlaceholder.classList.add('hidden');
      queueGrid.classList.remove('hidden');
      summaryCard.classList.remove('hidden');
      queueActionsInline.classList.remove('hidden');
    } else {
      emptyQueuePlaceholder.classList.remove('hidden');
      queueGrid.classList.add('hidden');
      summaryCard.classList.add('hidden');
      queueActionsInline.classList.add('hidden');
    }
    
    updateSummaryStats();
  }

  function updateSummaryStats() {
    let totalOriginal = 0;
    let totalCompressed = 0;
    let successCount = 0;

    queue.forEach(item => {
      totalOriginal += item.originalSize;
      if (item.status === 'success' && item.compressedSize) {
        // Use compressed size, or original size if compressed is larger
        totalCompressed += Math.min(item.compressedSize, item.originalSize);
        successCount++;
      } else {
        totalCompressed += item.originalSize; // Fallback to original size if not processed yet
      }
    });

    totalOriginalSizeEl.textContent = formatBytes(totalOriginal);
    totalCompressedSizeEl.textContent = formatBytes(totalCompressed);

    if (totalOriginal > 0 && successCount > 0) {
      const savings = totalOriginal - totalCompressed;
      const percent = Math.max(0, Math.round((savings / totalOriginal) * 100));
      totalSavingsPercentEl.textContent = `${percent}% Saved`;
      totalSavingsPercentEl.className = percent > 0 ? 'savings-percent-badge' : 'savings-percent-badge text-muted';
      downloadZipBtn.disabled = false;
    } else {
      totalSavingsPercentEl.textContent = '0% Saved';
      totalSavingsPercentEl.className = 'savings-percent-badge text-muted';
      downloadZipBtn.disabled = true;
    }
  }

  function createQueueCard(item) {
    const card = document.createElement('div');
    card.className = 'image-item-card';
    card.id = `card-${item.id}`;
    
    // Header Remove Button
    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn-remove';
    removeBtn.title = 'Remove file';
    removeBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"/>
        <line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    `;
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeItemFromQueue(item.id);
    });
    card.appendChild(removeBtn);

    // Preview area
    const previewWrapper = document.createElement('div');
    previewWrapper.className = 'image-preview-wrapper';
    
    const previewImg = document.createElement('img');
    previewImg.className = 'image-preview';
    previewImg.alt = item.name;
    
    // Load local thumbnail URL
    const reader = new FileReader();
    reader.onload = (e) => {
      previewImg.src = e.target.result;
    };
    reader.readAsDataURL(item.file);
    
    previewWrapper.appendChild(previewImg);

    const formatBadge = document.createElement('span');
    formatBadge.className = 'image-format-badge';
    formatBadge.textContent = getFormatLabel(item.originalFormat);
    previewWrapper.appendChild(formatBadge);
    
    card.appendChild(previewWrapper);

    // Details Area
    const details = document.createElement('div');
    details.className = 'image-details';

    const title = document.createElement('div');
    title.className = 'image-title';
    title.textContent = item.name;
    title.title = item.name;
    details.appendChild(title);

    // Size comparison row
    const sizeRow = document.createElement('div');
    sizeRow.className = 'size-comparison-row';
    sizeRow.innerHTML = `
      <div class="size-stat">
        <span class="size-stat-label">Before</span>
        <span class="size-stat-val">${formatBytes(item.originalSize)}</span>
      </div>
      <span class="size-arrow">&rarr;</span>
      <div class="size-stat text-right">
        <span class="size-stat-label">After</span>
        <span class="size-stat-val" id="size-after-${item.id}">--</span>
      </div>
      <span class="savings-card-badge hidden" id="savings-badge-${item.id}">-0%</span>
    `;
    details.appendChild(sizeRow);

    // Progress Bar Wrapper
    const progressWrapper = document.createElement('div');
    progressWrapper.className = 'card-progress-wrapper';
    progressWrapper.innerHTML = `
      <div class="card-progress-bar">
        <div class="card-progress-fill" id="progress-${item.id}" style="width: 0%"></div>
      </div>
    `;
    details.appendChild(progressWrapper);

    // Footer actions
    const footerActions = document.createElement('div');
    footerActions.className = 'card-footer-actions';
    
    // Status Pill
    const statusPill = document.createElement('span');
    statusPill.className = 'status-pill';
    statusPill.id = `status-pill-${item.id}`;
    statusPill.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="spin-icon">
        <circle cx="12" cy="12" r="10"/>
        <polyline points="12 6 12 12 16 14"/>
      </svg>
      <span>Waiting...</span>
    `;
    footerActions.appendChild(statusPill);

    // Download individual button (Hidden initially)
    const downloadBtn = document.createElement('button');
    downloadBtn.className = 'btn-card-download hidden';
    downloadBtn.id = `download-btn-${item.id}`;
    downloadBtn.title = 'Download compressed image';
    downloadBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
    `;
    downloadBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      downloadSingleItem(item);
    });
    footerActions.appendChild(downloadBtn);

    details.appendChild(footerActions);
    card.appendChild(details);
    
    queueGrid.appendChild(card);
  }

  function updateQueueCardState(item) {
    const cardEl = document.getElementById(`card-${item.id}`);
    const sizeAfterEl = document.getElementById(`size-after-${item.id}`);
    const savingsBadgeEl = document.getElementById(`savings-badge-${item.id}`);
    const progressEl = document.getElementById(`progress-${item.id}`);
    const statusPillEl = document.getElementById(`status-pill-${item.id}`);
    const downloadBtnEl = document.getElementById(`download-btn-${item.id}`);

    if (!cardEl) return;

    // Reset card classes
    cardEl.classList.remove('success-state', 'compressing-state');

    // Update Progress
    if (progressEl) {
      progressEl.style.width = `${item.progress}%`;
    }

    if (item.status === 'processing') {
      cardEl.classList.add('compressing-state');
      statusPillEl.className = 'status-pill processing';
      statusPillEl.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="spin-icon">
          <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
        </svg>
        <span>Compressing (${item.progress}%)</span>
      `;
      sizeAfterEl.textContent = '...';
      savingsBadgeEl.classList.add('hidden');
      downloadBtnEl.classList.add('hidden');
    } 
    
    else if (item.status === 'success') {
      cardEl.classList.add('success-state');
      statusPillEl.className = 'status-pill success';
      statusPillEl.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        <span>Finished</span>
      `;
      
      const displaysOriginal = item.compressedSize >= item.originalSize;
      
      if (displaysOriginal) {
        sizeAfterEl.textContent = formatBytes(item.originalSize);
        savingsBadgeEl.textContent = '100% Quality';
        savingsBadgeEl.style.backgroundColor = 'var(--color-primary)';
        savingsBadgeEl.style.boxShadow = '0 2px 8px var(--color-primary-glow)';
        savingsBadgeEl.classList.remove('hidden');
        showToast(`${item.name} could not be reduced further. Original file will be downloaded to preserve quality.`, 'info');
      } else {
        sizeAfterEl.textContent = formatBytes(item.compressedSize);
        const savings = item.originalSize - item.compressedSize;
        const savingsPercent = Math.round((savings / item.originalSize) * 100);
        savingsBadgeEl.textContent = `-${savingsPercent}%`;
        savingsBadgeEl.style.backgroundColor = 'var(--color-success)';
        savingsBadgeEl.style.boxShadow = '0 2px 8px var(--color-success-glow)';
        savingsBadgeEl.classList.remove('hidden');
      }

      downloadBtnEl.classList.remove('hidden');
    } 
    
    else if (item.status === 'error') {
      statusPillEl.className = 'status-pill error';
      statusPillEl.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <span>Failed</span>
      `;
      sizeAfterEl.textContent = 'Error';
      savingsBadgeEl.classList.add('hidden');
      downloadBtnEl.classList.add('hidden');
    }
  }

  /* ==========================================================================
     SETTINGS CHANGE ACTIONS
     ========================================================================== */

  function handleQualitySliderInput() {
    const val = qualitySlider.value;
    qualityValue.textContent = `${val}%`;

    // Dynamic quality text label
    if (val < 30) {
      qualityDesc.textContent = "Maximum Compression (Low Quality / Very Small)";
      qualityDesc.className = "quality-desc text-danger";
    } else if (val >= 30 && val < 60) {
      qualityDesc.textContent = "High Compression (Medium Quality / Compact)";
      qualityDesc.className = "quality-desc text-primary";
    } else if (val >= 60 && val < 86) {
      qualityDesc.textContent = "Recommended (Balanced Quality/Size)";
      qualityDesc.className = "quality-desc text-success";
    } else {
      qualityDesc.textContent = "Maximum Quality (Minimal Compression / Large)";
      qualityDesc.className = "quality-desc text-muted";
    }

    triggerRecompression(600); // Debounce slider re-compression
  }

  function handleFormatSelectChange() {
    const format = formatSelect.value;
    if (format === 'original') {
      formatInfo.textContent = "PNG outputs cannot be compressed without format conversion. Choose WebP for maximum savings.";
    } else if (format === 'webp') {
      formatInfo.textContent = "WebP offers standard-setting quality and transparent compression, saving up to 90% space.";
    } else if (format === 'jpeg') {
      formatInfo.textContent = "JPEG offers excellent compression for photographs, but does not support alpha transparency.";
    } else if (format === 'png') {
      formatInfo.textContent = "PNG is a lossless format. Canvas re-compression won't save much file size but retains transparency.";
    }

    triggerRecompression(300);
  }

  function triggerRecompression(delay = 400) {
    if (compressionTimeout) {
      clearTimeout(compressionTimeout);
    }

    if (queue.length === 0) return;

    compressionTimeout = setTimeout(() => {
      // Set all success/failed items back to pending
      queue.forEach(item => {
        if (item.status !== 'processing') {
          item.status = 'pending';
          item.progress = 0;
          if (item.compressedUrl) {
            URL.revokeObjectURL(item.compressedUrl);
            item.compressedUrl = null;
          }
          item.compressedBlob = null;
          item.compressedSize = null;
          updateQueueCardState(item);
        }
      });
      
      updateSummaryStats();
      processPendingQueue();
    }, delay);
  }

  /* ==========================================================================
     IMAGE COMPRESSION CORE EXECUTION
     ========================================================================== */

  async function processPendingQueue() {
    // Process queue in serial to avoid browser crash/lag
    const nextItem = queue.find(item => item.status === 'pending');
    if (!nextItem) {
      updateSummaryStats();
      return;
    }

    nextItem.status = 'processing';
    nextItem.progress = 10;
    updateQueueCardState(nextItem);

    const qualityVal = parseInt(qualitySlider.value) / 100;
    const formatVal = formatSelect.value;
    const resizeVal = resizeSelect.value;

    try {
      const resultBlob = await executeCompression(
        nextItem.file, 
        qualityVal, 
        formatVal, 
        resizeVal, 
        (prog) => {
          nextItem.progress = prog;
          updateQueueCardState(nextItem);
        }
      );

      nextItem.status = 'success';
      nextItem.progress = 100;
      nextItem.compressedBlob = resultBlob;
      nextItem.compressedSize = resultBlob.size;
      nextItem.compressedFormat = resultBlob.type;
      nextItem.compressedUrl = URL.createObjectURL(resultBlob);

      updateQueueCardState(nextItem);
    } catch (err) {
      console.error(err);
      nextItem.status = 'error';
      nextItem.errorMessage = err.message;
      updateQueueCardState(nextItem);
      showToast(`Failed to compress ${nextItem.name}: ${err.message}`, 'error');
    }

    // Process the next item in the queue
    processPendingQueue();
  }

  async function executeCompression(file, quality, outputFormat, resizeLimit, onProgress) {
    let targetMime = file.type;
    if (outputFormat === 'webp') targetMime = 'image/webp';
    else if (outputFormat === 'jpeg') targetMime = 'image/jpeg';
    else if (outputFormat === 'png') targetMime = 'image/png';
    else if (outputFormat === 'original') {
      targetMime = file.type;
    }

    // Attempt browser-image-compression library (Web Workers / multi-threaded)
    if (window.imageCompression) {
      try {
        const options = {
          maxSizeMB: 50,
          useWebWorker: true,
          initialQuality: quality,
          fileType: targetMime,
          onProgress: (p) => {
            if (onProgress) onProgress(Math.min(Math.round(p), 90));
          }
        };
        if (resizeLimit !== 'original') {
          options.maxWidthOrHeight = parseInt(resizeLimit);
        }
        const compressedFile = await window.imageCompression(file, options);
        if (onProgress) onProgress(100);
        return compressedFile;
      } catch (err) {
        console.warn("browser-image-compression API failed. Falling back to native canvas API...", err);
      }
    }

    // Fallback directly to native Canvas API compression
    if (onProgress) onProgress(50);
    const canvasResult = await compressWithCanvas(file, quality, targetMime, resizeLimit);
    if (onProgress) onProgress(100);
    return canvasResult;
  }

  function compressWithCanvas(file, quality, mimeType, maxDim) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
          let width = img.width;
          let height = img.height;
          
          if (maxDim && maxDim !== 'original') {
            const max = parseInt(maxDim);
            if (width > max || height > max) {
              if (width > height) {
                height = Math.round((height * max) / width);
                width = max;
              } else {
                width = Math.round((width * max) / height);
                height = max;
              }
            }
          }
          
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          
          canvas.toBlob((blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error("Canvas export blank"));
            }
          }, mimeType, quality);
        };
        img.onerror = () => reject(new Error("Failed to load image preview"));
        img.src = e.target.result;
      };
      reader.onerror = () => reject(new Error("File stream failed"));
      reader.readAsDataURL(file);
    });
  }

  /* ==========================================================================
     DOWNLOAD & ARCHIVING ACTIONS
     ========================================================================== */

  function downloadSingleItem(item) {
    if (item.status !== 'success' || !item.compressedBlob) {
      showToast("Image compression incomplete.", "error");
      return;
    }

    // Detect if original is smaller than compressed. If so, download original
    const useOriginal = item.compressedSize >= item.originalSize;
    const downloadBlob = useOriginal ? item.file : item.compressedBlob;
    const downloadUrl = useOriginal ? URL.createObjectURL(item.file) : item.compressedUrl;
    
    const extension = getExtensionForMime(downloadBlob.type);
    const outputName = getOutputFileName(item.name, extension);

    triggerBlobDownload(downloadUrl, outputName);
    
    // Revoke temp object URL if we instantiated a temporary original URL
    if (useOriginal) {
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 5000);
    }
  }

  async function downloadAllAsZip() {
    const successItems = queue.filter(item => item.status === 'success' && item.compressedBlob);
    
    if (successItems.length === 0) {
      showToast("No compressed images ready for download.", "error");
      return;
    }

    if (!window.JSZip) {
      showToast("ZIP compression engine unavailable. Please refresh or check connection.", "error");
      return;
    }

    downloadZipBtn.disabled = true;
    const originalText = downloadZipBtn.innerHTML;
    downloadZipBtn.innerHTML = `
      <svg class="spin-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
      </svg>
      <span>Creating ZIP Archive...</span>
    `;

    try {
      const zip = new JSZip();
      
      successItems.forEach(item => {
        // Smart fallback: Check if compressed size is larger than original
        const useOriginal = item.compressedSize >= item.originalSize;
        const addBlob = useOriginal ? item.file : item.compressedBlob;
        
        const extension = getExtensionForMime(addBlob.type);
        const fileName = getOutputFileName(item.name, extension);
        zip.file(fileName, addBlob);
      });

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const zipUrl = URL.createObjectURL(zipBlob);
      
      triggerBlobDownload(zipUrl, `optisqueeze_compressed_${Date.now()}.zip`);
      showToast(`Downloaded ZIP package containing ${successItems.length} images!`, "success");
      
      setTimeout(() => URL.revokeObjectURL(zipUrl), 10000);
    } catch (err) {
      console.error(err);
      showToast("Failed to create ZIP package: " + err.message, "error");
    } finally {
      downloadZipBtn.disabled = false;
      downloadZipBtn.innerHTML = originalText;
    }
  }

  function triggerBlobDownload(url, filename) {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  /* ==========================================================================
     QUEUE RESET & MEMORY CLEANUP
     ========================================================================== */

  function removeItemFromQueue(id) {
    const index = queue.findIndex(item => item.id === id);
    if (index === -1) return;

    const item = queue[index];
    // Revoke object URLs to avoid memory leaks
    if (item.compressedUrl) {
      URL.revokeObjectURL(item.compressedUrl);
    }
    
    // Remove element from DOM
    const cardEl = document.getElementById(`card-${id}`);
    if (cardEl) {
      cardEl.classList.add('fade-out');
      // Wait for animation to finish
      setTimeout(() => {
        cardEl.remove();
        queue.splice(index, 1);
        updateUIQueueState();
      }, 250);
    } else {
      queue.splice(index, 1);
      updateUIQueueState();
    }
  }

  function clearQueue() {
    if (queue.length === 0) return;

    // Revoke all created URLs
    queue.forEach(item => {
      if (item.compressedUrl) {
        URL.revokeObjectURL(item.compressedUrl);
      }
    });

    queue = [];
    queueGrid.innerHTML = '';
    updateUIQueueState();
    showToast("Cleared upload queue.", "success");
  }

  /* ==========================================================================
     UTILITIES & FORMATTERS
     ========================================================================== */

  function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  function getFormatLabel(mimeType) {
    if (mimeType === 'image/jpeg') return 'JPG';
    if (mimeType === 'image/png') return 'PNG';
    if (mimeType === 'image/webp') return 'WebP';
    return mimeType.split('/')[1]?.toUpperCase() || 'IMG';
  }

  function getExtensionForMime(mimeType) {
    if (mimeType === 'image/jpeg') return 'jpg';
    if (mimeType === 'image/png') return 'png';
    if (mimeType === 'image/webp') return 'webp';
    return mimeType.split('/')[1] || 'bin';
  }

  function getOutputFileName(originalName, newExtension) {
    const lastDotIndex = originalName.lastIndexOf('.');
    const baseName = lastDotIndex !== -1 ? originalName.substring(0, lastDotIndex) : originalName;
    // Append suffix to indicate local optimization
    return `${baseName}_optimized.${newExtension}`;
  }

  /* Toast Notification system */
  function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let iconSvg = '';
    if (type === 'success') {
      iconSvg = `
        <svg class="toast-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      `;
    } else if (type === 'error') {
      iconSvg = `
        <svg class="toast-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
      `;
    } else {
      iconSvg = `
        <svg class="toast-icon" style="color: var(--color-primary);" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="16" x2="12" y2="12"/>
          <line x1="12" y1="9" x2="12.01" y2="9"/>
        </svg>
      `;
    }

    toast.innerHTML = `
      ${iconSvg}
      <span>${message}</span>
    `;

    toastContainer.appendChild(toast);

    // Fade out and remove
    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => {
        toast.remove();
      }, 300);
    }, 4000);
  }
});
