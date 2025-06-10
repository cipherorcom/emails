// 这个文件用于处理接收邮件的功能
// 在 Cloudflare Workers 中，可以通过配置邮件路由来接收邮件

export async function handleIncomingEmail(env, message) {
  // 解析接收到的邮件
  const { from, to, subject, text, html } = message;
  
  // 存储接收到的邮件
  const timestamp = Date.now().toString();
  const id = `email:${timestamp}`;
  
  const emailData = {
    from,
    to,
    subject,
    text,
    html,
    type: 'received',
    timestamp: new Date().toISOString(),
  };
  
  // 存储邮件
  await env.EMAIL_STORE.put(id, JSON.stringify(emailData));
  
  return { success: true, id };
}

// 注意：要在 Cloudflare 控制台中配置 Email Routing 
// 具体步骤：
// 1. 在 Cloudflare 控制台中找到 "Email" 选项
// 2. 设置你的域名邮件路由
// 3. 创建一个自定义地址和目标
// 4. 选择 "Worker" 作为目标并选择你部署的 worker
