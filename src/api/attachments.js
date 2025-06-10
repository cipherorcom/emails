// 附件API处理模块
import { Hono } from 'hono';

// 创建附件API路由
const attachmentsApi = new Hono();

// 上传附件
attachmentsApi.post('/upload', async (c) => {
  try {
    // 获取文件
    const formData = await c.req.formData();
    const file = formData.get('file');
    
    if (!file) {
      return c.json({ success: false, message: '没有提供文件' }, 400);
    }
    
    // 检查文件大小（10MB限制）
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return c.json({ success: false, message: '文件太大，超过了10MB限制' }, 400);
    }
    
    // 创建唯一的文件名
    const timestamp = Date.now();
    const uniqueFilename = formData.get('filename') || `${timestamp}-${file.name}`;
    
    // 读取文件内容
    const arrayBuffer = await file.arrayBuffer();
    
    // 上传到R2存储桶
    await c.env.EMAIL_ATTACHMENTS.put(uniqueFilename, arrayBuffer, {
      httpMetadata: {
        contentType: file.type,
        contentDisposition: `attachment; filename="${file.name}"`
      }
    });
    
    // 获取公共URL（如果配置了公共访问）
    // 注意：在实际生产环境中，您可能需要使用签名URL或其他访问控制机制
    const url = `${c.req.url.split('/api/')[0]}/api/attachments/${uniqueFilename}`;
    
    // 记录附件信息到KV存储
    const attachmentInfo = {
      id: uniqueFilename,
      originalName: file.name,
      type: file.type,
      size: file.size,
      uploadedAt: new Date().toISOString(),
      url: url
    };
    
    await c.env.EMAIL_STORE.put(`attachment:${uniqueFilename}`, JSON.stringify(attachmentInfo));
    
    // 返回成功响应
    return c.json({
      success: true,
      id: uniqueFilename,
      name: file.name,
      type: file.type,
      size: file.size,
      url: url
    });
  } catch (error) {
    console.error('上传附件错误:', error);
    return c.json({ success: false, message: '上传附件失败' }, 500);
  }
});

// 获取附件
attachmentsApi.get('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    
    // 从R2获取文件
    const file = await c.env.EMAIL_ATTACHMENTS.get(id);
    
    if (!file) {
      return c.json({ success: false, message: '附件不存在' }, 404);
    }
    
    // 获取文件元数据
    const headers = new Headers();
    file.writeHttpMetadata(headers);
    headers.set('Content-Type', file.httpMetadata.contentType || 'application/octet-stream');
    
    // 返回文件内容
    return new Response(file.body, {
      headers
    });
  } catch (error) {
    console.error('获取附件错误:', error);
    return c.json({ success: false, message: '获取附件失败' }, 500);
  }
});

// 删除附件
attachmentsApi.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    
    // 从R2删除文件
    await c.env.EMAIL_ATTACHMENTS.delete(id);
    
    // 从KV存储中删除附件信息
    await c.env.EMAIL_STORE.delete(`attachment:${id}`);
    
    return c.json({ success: true, message: '附件已删除' });
  } catch (error) {
    console.error('删除附件错误:', error);
    return c.json({ success: false, message: '删除附件失败' }, 500);
  }
});

// 列出所有附件
attachmentsApi.get('/', async (c) => {
  try {
    // 从KV存储中获取所有附件信息
    const list = await c.env.EMAIL_STORE.list({ prefix: 'attachment:' });
    const attachments = [];
    
    for (const key of list.keys) {
      const attachmentData = await c.env.EMAIL_STORE.get(key.name);
      if (attachmentData) {
        attachments.push(JSON.parse(attachmentData));
      }
    }
    
    return c.json({ success: true, data: attachments });
  } catch (error) {
    console.error('列出附件错误:', error);
    return c.json({ success: false, message: '获取附件列表失败' }, 500);
  }
});

export default attachmentsApi; 