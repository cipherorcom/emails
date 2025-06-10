// English language pack
export default {
  // Common
  app_name: 'Email System',
  loading: 'Loading...',
  error: 'Error',
  success: 'Success',
  save: 'Save',
  cancel: 'Cancel',
  delete: 'Delete',
  confirm: 'Confirm',
  back: 'Back',
  optional: 'Optional',
  
  // Navigation
  nav_inbox: 'Inbox',
  nav_sent: 'Sent',
  nav_compose: 'Compose',
  nav_welcome: 'Welcome',
  nav_logout: 'Logout',
  nav_diagnostic: 'Diagnostics',
  
  // Login
  login_title: 'Login',
  login_username: 'Username',
  login_password: 'Password',
  login_remember: 'Remember me',
  login_button: 'Login',
  login_error: 'Invalid username or password',
  login_success: 'Login successful! Redirecting...',
  login_processing: 'Logging in...',
  login_info: 'Please use the system configured username and password to login',
  
  // Inbox
  inbox_title: 'Inbox',
  inbox_empty: 'No received emails',
  inbox_load_error: 'Failed to load',
  
  // Sent
  sent_title: 'Sent Emails',
  sent_empty: 'No sent emails',
  sent_load_error: 'Failed to load',
  sent_to: 'Sent to',
  
  // Compose
  compose_title: 'Compose Email',
  compose_from: 'From',
  compose_to: 'To',
  compose_subject: 'Subject',
  compose_text: 'Text Content',
  compose_html: 'HTML Content',
  compose_html_tip: 'You can use simple HTML tags to format content',
  compose_attachments: 'Attachments',
  compose_add_attachment: 'Add Attachment',
  compose_send: 'Send Email',
  compose_sending: 'Sending email...',
  compose_success: 'Email sent successfully!',
  compose_error: 'Failed to send',
  compose_default_from: 'If not filled, the default Resend address will be used. Supported format: Name <email@example.com>',
  
  // Attachments
  attachment_name: 'Filename',
  attachment_size: 'Size',
  attachment_type: 'Type',
  attachment_actions: 'Actions',
  attachment_download: 'Download',
  attachment_delete: 'Delete',
  attachment_add: 'Add Attachment',
  attachment_drop: 'Drop files here or click to upload',
  attachment_max_size: 'Maximum file size: 10MB',
  attachment_uploading: 'Uploading...',
  attachment_upload_success: 'Upload successful',
  attachment_upload_error: 'Upload failed',
  attachment_size_error: 'File {filename} is too large, exceeds 10MB limit',
  attachment_delete_error: 'Failed to delete attachment',
  
  // Diagnostic page translations
  diagnostic_title: 'System Diagnostics',
  diagnostic_env_title: 'Environment Configuration Check',
  diagnostic_check_env: 'Check Environment',
  diagnostic_upload_title: 'Attachment Upload Test',
  diagnostic_test_upload: 'Test Upload',
  diagnostic_guide_title: 'Usage Guide',
  diagnostic_guide_1: '• Environment check displays the configuration status of KV storage, R2 storage, and API keys',
  diagnostic_guide_2: '• Attachment upload test verifies the complete process of uploading files to R2 storage',
  diagnostic_guide_3: '• If tests fail, please check Cloudflare Workers binding configuration',
  diagnostic_guide_4: '• Test files will be automatically deleted after testing completes'
};