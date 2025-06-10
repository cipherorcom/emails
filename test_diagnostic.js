// 测试诊断API的脚本
const BASE_URL = 'http://localhost:65285';

async function testDiagnosticAPI() {
  console.log('开始测试诊断API...\n');
  
  try {
    // 1. 测试环境检查
    console.log('1. 测试环境检查 API...');
    const envResponse = await fetch(`${BASE_URL}/api/diagnostic/env`);
    const envResult = await envResponse.json();
    
    console.log('环境检查结果:');
    console.log('- KV存储:', envResult.hasEmailStore ? '✅ 已配置' : '❌ 未配置');
    console.log('- R2存储:', envResult.hasEmailAttachments ? '✅ 已配置' : '❌ 未配置');
    console.log('- Resend API Key:', envResult.hasResendApiKey ? '✅ 已配置' : '❌ 未配置');
    
    if (envResult.kvTest) {
      console.log('- KV测试:', envResult.kvTest.success ? '✅ 成功' : '❌ 失败');
      if (!envResult.kvTest.success) {
        console.log('  错误:', envResult.kvTest.error);
      }
    }
    
    if (envResult.r2Test) {
      console.log('- R2测试:', envResult.r2Test.success ? '✅ 成功' : '❌ 失败');
      if (!envResult.r2Test.success) {
        console.log('  错误:', envResult.r2Test.error);
      }
    }
    
    console.log('\n2. 测试文件上传诊断...');
    
    // 创建一个测试文件
    const testFileContent = 'This is a test file for diagnostics';
    const blob = new Blob([testFileContent], { type: 'text/plain' });
    const testFile = new File([blob], 'test-diagnostic.txt', { type: 'text/plain' });
    
    const formData = new FormData();
    formData.append('file', testFile);
    
    const uploadResponse = await fetch(`${BASE_URL}/api/diagnostic/upload-test`, {
      method: 'POST',
      body: formData
    });
    
    const uploadResult = await uploadResponse.json();
    
    console.log('文件上传测试结果:');
    console.log('- 文件信息:', uploadResult.file ? '✅ 读取成功' : '❌ 读取失败');
    if (uploadResult.file) {
      console.log(`  文件名: ${uploadResult.file.name}`);
      console.log(`  文件大小: ${uploadResult.file.size} bytes`);
      console.log(`  文件类型: ${uploadResult.file.type}`);
    }
    
    if (uploadResult.upload) {
      console.log('- R2上传:', uploadResult.upload.success ? '✅ 成功' : '❌ 失败');
      if (uploadResult.upload.success) {
        console.log(`  上传文件名: ${uploadResult.upload.filename}`);
        console.log(`  上传大小: ${uploadResult.upload.uploadedSize} bytes`);
      } else {
        console.log('  错误:', uploadResult.upload.error);
      }
    }
    
    console.log('\n诊断测试完成！');
    
  } catch (error) {
    console.error('测试过程中发生错误:', error);
  }
}

// 如果在Node.js环境中运行
if (typeof window === 'undefined') {
  // Node.js环境
  const fetch = require('node-fetch');
  const FormData = require('form-data');
  const { Blob } = require('buffer');
  
  testDiagnosticAPI();
} else {
  // 浏览器环境
  window.testDiagnosticAPI = testDiagnosticAPI;
  console.log('测试函数已加载，请在浏览器控制台中运行: testDiagnosticAPI()');
}
