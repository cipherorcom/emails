// 中文语言包
export default {
  // 通用
  app_name: '邮件系统',
  loading: '加载中...',
  error: '错误',
  success: '成功',
  save: '保存',
  cancel: '取消',
  delete: '删除',
  confirm: '确认',
  back: '返回',
  optional: '可选',
  
  // 导航
  nav_inbox: '收件箱',
  nav_sent: '已发送',
  nav_compose: '写邮件',
  nav_welcome: '欢迎',
  nav_logout: '退出',
  nav_diagnostic: '系统诊断',
  
  // 登录
  login_title: '登录',
  login_username: '用户名',
  login_password: '密码',
  login_remember: '记住我',
  login_button: '登录',
  login_error: '用户名或密码错误',
  login_success: '登录成功！正在跳转...',
  login_processing: '登录中...',
  login_info: '请使用系统配置的用户名和密码登录',
  
  // 收件箱
  inbox_title: '收件箱',
  inbox_empty: '没有收到的邮件',
  inbox_load_error: '加载失败',
  
  // 已发送
  sent_title: '已发送邮件',
  sent_empty: '没有发送的邮件',
  sent_load_error: '加载失败',
  sent_to: '发送给',
  
  // 写邮件
  compose_title: '写邮件',
  compose_from: '发件人',
  compose_to: '收件人',
  compose_subject: '主题',
  compose_text: '文本内容',
  compose_html: 'HTML 内容',
  compose_html_tip: '可以使用简单的 HTML 标签格式化内容',
  compose_attachments: '附件',
  compose_add_attachment: '添加附件',
  compose_send: '发送邮件',
  compose_sending: '正在发送邮件...',
  compose_success: '邮件发送成功！',
  compose_error: '发送失败',
  compose_default_from: '如果不填写，将使用默认的 Resend 发送地址。支持格式：姓名 <邮箱地址>',
  
  // 附件
  attachment_name: '文件名',
  attachment_size: '大小',
  attachment_type: '类型',
  attachment_actions: '操作',
  attachment_download: '下载',
  attachment_delete: '删除',
  attachment_add: '添加附件',
  attachment_drop: '拖放文件到此处或点击上传',
  attachment_max_size: '最大文件大小: 10MB',
  attachment_uploading: '上传中...',
  attachment_upload_success: '上传成功',
  attachment_upload_error: '上传失败',
  attachment_size_error: '文件 {filename} 太大，超过了10MB限制',
  attachment_delete_error: '删除附件失败',
  
  // 诊断页面翻译
  diagnostic_title: '系统诊断',
  diagnostic_env_title: '环境配置检查',
  diagnostic_check_env: '检查环境',
  diagnostic_upload_title: '附件上传测试',
  diagnostic_test_upload: '测试上传',
  diagnostic_guide_title: '使用指南',
  diagnostic_guide_1: '• 环境检查将显示 KV 存储、R2 存储和 API 密钥的配置状态',
  diagnostic_guide_2: '• 附件上传测试将验证文件上传到 R2 存储的完整流程',
  diagnostic_guide_3: '• 如果测试失败，请检查 Cloudflare Workers 的绑定配置',
  diagnostic_guide_4: '• 测试文件会在测试完成后自动删除'
};