// 附件处理模块

// 文件大小格式化
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 获取文件类型图标
export function getFileTypeIcon(filename) {
  const extension = filename.split('.').pop().toLowerCase();
  
  const iconMap = {
    // 图片
    'jpg': '🖼️',
    'jpeg': '🖼️',
    'png': '🖼️',
    'gif': '🖼️',
    'svg': '🖼️',
    'webp': '🖼️',
    
    // 文档
    'pdf': '📄',
    'doc': '📝',
    'docx': '📝',
    'txt': '📝',
    'rtf': '📝',
    
    // 表格
    'xls': '📊',
    'xlsx': '📊',
    'csv': '📊',
    
    // 演示文稿
    'ppt': '📊',
    'pptx': '📊',
    
    // 压缩文件
    'zip': '📦',
    'rar': '📦',
    '7z': '📦',
    'tar': '📦',
    'gz': '📦',
    
    // 代码
    'js': '📜',
    'ts': '📜',
    'html': '📜',
    'css': '📜',
    'json': '📜',
    'xml': '📜',
    
    // 音频
    'mp3': '🎵',
    'wav': '🎵',
    'ogg': '🎵',
    
    // 视频
    'mp4': '🎬',
    'avi': '🎬',
    'mov': '🎬',
    'wmv': '🎬',
    
    // 其他
    'default': '📎'
  };
  
  return iconMap[extension] || iconMap['default'];
}

// 上传附件到R2存储桶
export async function uploadAttachment(file) {
  try {
    // 创建唯一的文件名
    const timestamp = Date.now();
    const uniqueFilename = `${timestamp}-${file.name}`;
    
    // 创建表单数据
    const formData = new FormData();
    formData.append('file', file);
    formData.append('filename', uniqueFilename);
    
    // 发送上传请求
    const response = await fetch('/api/attachments/upload', {
      method: 'POST',
      body: formData
    });
    
    // 处理响应
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || '上传失败');
    }
    
    // 返回上传结果
    return await response.json();
  } catch (error) {
    console.error('上传附件失败:', error);
    throw error;
  }
}

// 下载附件
export async function downloadAttachment(attachmentId, filename) {
  try {
    // 获取下载URL
    const response = await fetch(`/api/attachments/${attachmentId}`);
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || '下载失败');
    }
    
    // 如果是直接返回文件内容
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    
    // 创建下载链接
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    
    // 清理
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    
    return true;
  } catch (error) {
    console.error('下载附件失败:', error);
    throw error;
  }
}

// 删除附件
export async function deleteAttachment(attachmentId) {
  try {
    const response = await fetch(`/api/attachments/${attachmentId}`, {
      method: 'DELETE'
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || '删除失败');
    }
    
    return await response.json();
  } catch (error) {
    console.error('删除附件失败:', error);
    throw error;
  }
}

export default {
  formatFileSize,
  getFileTypeIcon,
  uploadAttachment,
  downloadAttachment,
  deleteAttachment
}; 