// 用户认证管理模块 - 简化版

// 验证用户函数 - 使用环境变量中的认证信息
export async function verifyUser(env, username, password) {
  // 从环境变量获取用户名和密码
  const authUser = env.AUTH_USER;
  const authPassword = env.AUTH_PASSWORD;
  
  // 验证用户名和密码是否匹配
  if (username === authUser && password === authPassword) {
    return { 
      success: true, 
      user: {
        username: authUser,
        email: env.AUTH_EMAIL || 'admin@example.com',
        role: 'admin'
      }
    };
  }
  
  return { success: false, message: '用户名或密码错误' };
}

// 获取用户信息 - 简单返回配置的用户
export async function getUserInfo(env) {
  return {
    username: env.AUTH_USER || 'admin',
    email: env.AUTH_EMAIL || 'admin@example.com',
    role: 'admin'
  };
}
