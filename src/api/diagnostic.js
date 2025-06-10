// 诊断API - 用于排查附件上传问题
import { Hono } from 'hono';

const diagnosticApi = new Hono();

// 环境诊断端点
diagnosticApi.get('/env', async (c) => {
  try {
    const envInfo = {
      timestamp: new Date().toISOString(),
      hasEmailStore: !!c.env.EMAIL_STORE,
      hasEmailAttachments: !!c.env.EMAIL_ATTACHMENTS,
      hasResendApiKey: !!c.env.RESEND_API_KEY,
      worker: {
        url: c.req.url,
        method: c.req.method,
        headers: Object.fromEntries(c.req.raw.headers.entries())
      }
    };

    // 测试KV存储
    if (c.env.EMAIL_STORE) {
      try {
        await c.env.EMAIL_STORE.put('diagnostic:test', JSON.stringify({ test: true }));
        const testValue = await c.env.EMAIL_STORE.get('diagnostic:test');
        envInfo.kvTest = {
          success: !!testValue,
          value: testValue ? JSON.parse(testValue) : null
        };
        await c.env.EMAIL_STORE.delete('diagnostic:test');
      } catch (error) {
        envInfo.kvTest = {
          success: false,
          error: error.message
        };
      }
    }

    // 测试R2存储
    if (c.env.EMAIL_ATTACHMENTS) {
      try {
        const testData = new TextEncoder().encode('diagnostic test');
        await c.env.EMAIL_ATTACHMENTS.put('diagnostic-test.txt', testData);
        const stored = await c.env.EMAIL_ATTACHMENTS.get('diagnostic-test.txt');
        envInfo.r2Test = {
          success: !!stored,
          size: stored ? stored.size : 0
        };
        await c.env.EMAIL_ATTACHMENTS.delete('diagnostic-test.txt');
      } catch (error) {
        envInfo.r2Test = {
          success: false,
          error: error.message
        };
      }
    }

    return c.json(envInfo);
  } catch (error) {
    return c.json({
      success: false,
      error: error.message,
      stack: error.stack
    }, 500);
  }
});

// 测试文件上传端点
diagnosticApi.post('/upload-test', async (c) => {
  try {
    console.log('诊断上传测试开始...');
    
    const formData = await c.req.formData();
    const file = formData.get('file');
    
    const diagnosticInfo = {
      timestamp: new Date().toISOString(),
      request: {
        contentType: c.req.header('content-type'),
        contentLength: c.req.header('content-length'),
        hasFile: !!file
      }
    };

    if (file) {
      diagnosticInfo.file = {
        name: file.name,
        size: file.size,
        type: file.type
      };

      // 尝试读取文件
      try {
        const buffer = await file.arrayBuffer();
        diagnosticInfo.file.bufferSize = buffer.byteLength;
        diagnosticInfo.file.readSuccess = true;
      } catch (error) {
        diagnosticInfo.file.readSuccess = false;
        diagnosticInfo.file.readError = error.message;
      }

      // 如果有R2绑定，尝试上传
      if (c.env.EMAIL_ATTACHMENTS) {
        try {
          const testFilename = `diagnostic-${Date.now()}-${file.name}`;
          const buffer = await file.arrayBuffer();
          
          await c.env.EMAIL_ATTACHMENTS.put(testFilename, buffer, {
            httpMetadata: {
              contentType: file.type,
              contentDisposition: `attachment; filename="${file.name}"`
            }
          });

          // 验证上传
          const uploaded = await c.env.EMAIL_ATTACHMENTS.get(testFilename);
          diagnosticInfo.upload = {
            success: !!uploaded,
            filename: testFilename,
            uploadedSize: uploaded ? uploaded.size : 0
          };

          // 清理测试文件
          await c.env.EMAIL_ATTACHMENTS.delete(testFilename);

        } catch (error) {
          diagnosticInfo.upload = {
            success: false,
            error: error.message,
            stack: error.stack
          };
        }
      } else {
        diagnosticInfo.upload = {
          success: false,
          error: 'EMAIL_ATTACHMENTS binding not found'
        };
      }
    }

    return c.json(diagnosticInfo);
  } catch (error) {
    console.error('诊断上传测试失败:', error);
    return c.json({
      success: false,
      error: error.message,
      stack: error.stack
    }, 500);
  }
});

export default diagnosticApi;
