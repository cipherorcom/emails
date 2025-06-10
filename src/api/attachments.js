// 附件API处理模块
import { Hono } from 'hono';

// 创建附件API路由
const attachmentsApi = new Hono();

// 上传附件
attachmentsApi.post('/upload', async (c) => {
  try {
    console.log('开始处理附件上传请求');
    
    // 检查环境绑定
    if (!c.env) {
      console.error('环境变量未绑定');
      return c.json({ success: false, message: '服务器配置错误：环境变量未绑定' }, 500);
    }
    
    if (!c.env.EMAIL_ATTACHMENTS) {
      console.error('R2存储桶未绑定：EMAIL_ATTACHMENTS');
      return c.json({ success: false, message: '服务器配置错误：R2存储桶未绑定' }, 500);
    }
    
    if (!c.env.EMAIL_STORE) {
      console.error('KV命名空间未绑定：EMAIL_STORE');
      return c.json({ success: false, message: '服务器配置错误：KV命名空间未绑定' }, 500);
    }
    
    console.log('环境绑定检查通过');
    
    // 获取文件
    const formData = await c.req.formData();
    const file = formData.get('file');
    
    console.log('接收到的FormData:', {
      fileExists: !!file,
      fileName: file?.name,
      fileSize: file?.size,
      fileType: file?.type
    });
    
    if (!file) {
      return c.json({ success: false, message: '没有提供文件' }, 400);
    }
    
    // 检查文件大小（10MB限制）
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      console.warn(`文件太大: ${file.size} bytes > ${maxSize} bytes`);
      return c.json({ success: false, message: '文件太大，超过了10MB限制' }, 400);
    }
    
    // 创建唯一的文件名
    const timestamp = Date.now();
    const uniqueFilename = formData.get('filename') || `${timestamp}-${file.name}`;
    
    console.log('生成的唯一文件名:', uniqueFilename);
    
    // 读取文件内容
    const arrayBuffer = await file.arrayBuffer();
    console.log('文件读取完成，大小:', arrayBuffer.byteLength, 'bytes');
    
    // 上传到R2存储桶
    console.log('开始上传到R2存储桶...');
    const putResult = await c.env.EMAIL_ATTACHMENTS.put(uniqueFilename, arrayBuffer, {
      httpMetadata: {
        contentType: file.type,
        contentDisposition: `attachment; filename="${file.name}"`
      }
    });
    
    console.log('R2上传结果:', putResult);
    
    // 获取公共URL（如果配置了公共访问）
    // 注意：在实际生产环境中，您可能需要使用签名URL或其他访问控制机制
    const baseUrl = c.req.url.split('/api/')[0];
    const url = `${baseUrl}/api/attachments/${uniqueFilename}`;
    
    console.log('生成的附件URL:', url);
    
    // 记录附件信息到KV存储
    const attachmentInfo = {
      id: uniqueFilename,
      originalName: file.name,
      type: file.type,
      size: file.size,
      uploadedAt: new Date().toISOString(),
      url: url
    };
    
    console.log('准备保存到KV存储的附件信息:', attachmentInfo);
    
    await c.env.EMAIL_STORE.put(`attachment:${uniqueFilename}`, JSON.stringify(attachmentInfo));
    
    console.log('附件信息已保存到KV存储');
    
    // 返回成功响应
    const response = {
      success: true,
      id: uniqueFilename,
      name: file.name,
      type: file.type,
      size: file.size,
      url: url
    };
    
    console.log('返回成功响应:', response);
    return c.json(response);
    
  } catch (error) {
    console.error('上传附件错误详情:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    return c.json({ 
      success: false, 
      message: `上传附件失败: ${error.message}`,
      error: error.name
    }, 500);
  }
});

// 获取附件
attachmentsApi.get('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    console.log('请求获取附件:', id);
    
    // 检查环境绑定
    if (!c.env.EMAIL_ATTACHMENTS) {
      console.error('R2存储桶未绑定：EMAIL_ATTACHMENTS');
      return c.json({ success: false, message: 'R2存储桶未绑定' }, 500);
    }
    
    // 从R2获取文件
    const file = await c.env.EMAIL_ATTACHMENTS.get(id);
    
    if (!file) {
      console.log('附件不存在:', id);
      return c.json({ success: false, message: '附件不存在' }, 404);
    }
    
    console.log('找到附件，准备返回文件:', {
      id: id,
      size: file.size,
      contentType: file.httpMetadata?.contentType
    });
    
    // 获取文件元数据
    const headers = new Headers();
    file.writeHttpMetadata(headers);
    headers.set('Content-Type', file.httpMetadata?.contentType || 'application/octet-stream');
    
    // 返回文件内容
    return new Response(file.body, {
      headers
    });
  } catch (error) {
    console.error('获取附件错误:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    return c.json({ success: false, message: `获取附件失败: ${error.message}` }, 500);
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