// 附件上传组件
import { html } from 'hono/html';
import { t } from '../i18n';

// 渲染附件上传组件
export function renderAttachmentUploader() {
  return html`
    <div class="attachment-uploader border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4 mb-4">
      <div class="text-center py-4" id="drop-area">
        <svg class="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
          <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">${t('attachment_drop')}</p>
        <p class="text-xs text-gray-500 dark:text-gray-500">${t('attachment_max_size')}</p>
        <input id="file-input" type="file" class="hidden" multiple />
        <button type="button" id="browse-files" class="mt-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
          ${t('attachment_add')}
        </button>
      </div>
      
      <div id="attachments-list" class="mt-4 space-y-2 hidden">
        <h3 class="font-medium text-gray-900 dark:text-white">${t('compose_attachments')}</h3>
        <div id="attachments-container" class="space-y-2"></div>
      </div>
    </div>
    
    <script>
      document.addEventListener('DOMContentLoaded', () => {
        const dropArea = document.getElementById('drop-area');
        const fileInput = document.getElementById('file-input');
        const browseButton = document.getElementById('browse-files');
        const attachmentsList = document.getElementById('attachments-list');
        const attachmentsContainer = document.getElementById('attachments-container');
        
        // 存储已上传的附件
        const attachments = [];
        
        // 打开文件选择器
        browseButton.addEventListener('click', () => {
          fileInput.click();
        });
        
        // 处理文件选择
        fileInput.addEventListener('change', (e) => {
          handleFiles(e.target.files);
        });
        
        // 拖放事件
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
          dropArea.addEventListener(eventName, preventDefaults, false);
        });
        
        function preventDefaults(e) {
          e.preventDefault();
          e.stopPropagation();
        }
        
        ['dragenter', 'dragover'].forEach(eventName => {
          dropArea.addEventListener(eventName, highlight, false);
        });
        
        ['dragleave', 'drop'].forEach(eventName => {
          dropArea.addEventListener(eventName, unhighlight, false);
        });
        
        function highlight() {
          dropArea.classList.add('border-blue-500', 'bg-blue-50', 'dark:bg-blue-900/20');
        }
        
        function unhighlight() {
          dropArea.classList.remove('border-blue-500', 'bg-blue-50', 'dark:bg-blue-900/20');
        }
        
        // 处理文件拖放
        dropArea.addEventListener('drop', (e) => {
          const dt = e.dataTransfer;
          const files = dt.files;
          handleFiles(files);
        });
        
        // 处理文件
        function handleFiles(files) {
          if (files.length === 0) return;
          
          // 显示附件列表
          attachmentsList.classList.remove('hidden');
          
          // 处理每个文件
          [...files].forEach(file => {
            uploadFile(file);
          });
          
          // 清空文件输入，以便可以再次选择相同的文件
          fileInput.value = '';
        }
        
        // 上传文件
        async function uploadFile(file) {
          // 检查文件大小（10MB限制）
          const maxSize = 10 * 1024 * 1024; // 10MB
          if (file.size > maxSize) {
            const errorMsg = window.i18n ? window.i18n.t('attachment_size_error') : '文件太大，超过了10MB限制';
            alert(errorMsg.replace('{filename}', file.name));
            return;
          }
          
          console.log('开始上传文件:', {
            name: file.name,
            size: file.size,
            type: file.type
          });
          
          // 创建附件元素
          const attachmentId = 'attachment-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
          const attachmentEl = createAttachmentElement(attachmentId, file);
          attachmentsContainer.appendChild(attachmentEl);
          
          try {
            // 创建表单数据
            const formData = new FormData();
            formData.append('file', file);
            
            console.log('发送上传请求到 /api/attachments/upload');
            
            // 发送上传请求
            const response = await fetch('/api/attachments/upload', {
              method: 'POST',
              body: formData
            });
            
            console.log('收到响应:', {
              status: response.status,
              statusText: response.statusText,
              headers: Object.fromEntries(response.headers.entries())
            });
            
            if (!response.ok) {
              // 尝试获取错误详情
              let errorData;
              try {
                errorData = await response.json();
              } catch (e) {
                errorData = { message: '服务器响应格式错误' };
              }
              
              console.error('上传失败，服务器响应:', errorData);
              throw new Error(errorData.message || 'HTTP ' + response.status + ': ' + response.statusText);
            }
            
            // 获取上传结果
            const result = await response.json();
            console.log('上传成功，结果:', result);
            
            if (!result.success) {
              throw new Error(result.message || '上传失败');
            }
            
            // 更新附件状态
            updateAttachmentStatus(attachmentId, true, result.id);
            
            // 存储附件信息
            attachments.push({
              id: result.id,
              name: file.name,
              size: file.size,
              type: file.type,
              url: result.url
            });
            
            // 更新隐藏的附件输入字段
            updateAttachmentsInput();
            
            // 显示成功提示
            if (window.toast) {
              const successMsg = window.i18n ? window.i18n.t('attachment_upload_success') : '上传成功';
              window.toast.success(file.name + ': ' + successMsg);
            }
            
          } catch (error) {
            console.error('上传失败详情:', error);
            updateAttachmentStatus(attachmentId, false);
            
            // 显示错误提示
            const errorMsg = error.message || (window.i18n ? window.i18n.t('attachment_upload_error') : '上传失败');
            if (window.toast) {
              window.toast.error(file.name + ': ' + errorMsg);
            } else {
              alert(file.name + ': ' + errorMsg);
            }
          }
        }
        
        // 创建附件元素
        function createAttachmentElement(id, file) {
          const div = document.createElement('div');
          div.id = id;
          div.className = 'flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg';
          
          const fileIcon = getFileTypeIcon(file.name);
          const fileSize = formatFileSize(file.size);
          
          div.innerHTML = \`
            <div class="flex items-center space-x-3">
              <span class="text-xl">\${fileIcon}</span>
              <div>
                <p class="text-sm font-medium text-gray-900 dark:text-white truncate" style="max-width: 200px;">\${file.name}</p>
                <p class="text-xs text-gray-500 dark:text-gray-400">\${fileSize}</p>
              </div>
            </div>
            <div class="flex items-center">
              <div class="upload-status">
                <svg class="animate-spin h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </div>
              <button type="button" class="delete-attachment ml-2 text-red-500 hover:text-red-700" data-id="\${id}">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                </svg>
              </button>
            </div>
          \`;
          
          // 添加删除事件
          div.querySelector('.delete-attachment').addEventListener('click', () => {
            deleteAttachment(id);
          });
          
          return div;
        }
        
        // 更新附件状态
        function updateAttachmentStatus(id, success, attachmentId = null) {
          const attachmentEl = document.getElementById(id);
          if (!attachmentEl) return;
          
          const statusEl = attachmentEl.querySelector('.upload-status');
          
          if (success) {
            statusEl.innerHTML = \`
              <svg class="h-5 w-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
              </svg>
            \`;
            attachmentEl.dataset.attachmentId = attachmentId;
          } else {
            statusEl.innerHTML = \`
              <svg class="h-5 w-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            \`;
          }
        }
        
        // 删除附件
        async function deleteAttachment(id) {
          const attachmentEl = document.getElementById(id);
          if (!attachmentEl) return;
          
          const attachmentId = attachmentEl.dataset.attachmentId;
          
          // 如果已经上传到服务器，则删除
          if (attachmentId) {
            try {
              await fetch(\`/api/attachments/\${attachmentId}\`, {
                method: 'DELETE'
              });
              
              // 从附件列表中移除
              const index = attachments.findIndex(a => a.id === attachmentId);
              if (index !== -1) {
                attachments.splice(index, 1);
              }
            } catch (error) {
              console.error('删除附件失败:', error);
            }
          }
          
          // 从DOM中移除
          attachmentEl.remove();
          
          // 更新隐藏的附件输入字段
          updateAttachmentsInput();
          
          // 如果没有附件了，隐藏列表
          if (attachmentsContainer.children.length === 0) {
            attachmentsList.classList.add('hidden');
          }
        }
        
        // 更新隐藏的附件输入字段
        function updateAttachmentsInput() {
          // 如果window.updateAttachmentsInput存在，则调用它
          if (typeof window.updateAttachmentsInput === 'function') {
            window.updateAttachmentsInput(attachments);
          }
        }
        
        // 清空附件列表
        window.clearAttachments = function() {
          // 清空附件数组
          attachments.length = 0;
          
          // 清空DOM中的附件列表
          attachmentsContainer.innerHTML = '';
          
          // 隐藏附件列表
          attachmentsList.classList.add('hidden');
          
          // 更新隐藏的附件输入字段
          updateAttachmentsInput();
        };
      });
    </script>
  `;
}

export default {
  renderAttachmentUploader
}; 