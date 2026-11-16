const screens = {
  home: { title: '首页，一眼就熟悉。', src: 'assets/screen-home.png', description: '四宫格应用、分页与状态栏。来自设备上的开发界面捕获。' },
  music: { title: '喜欢的音乐，随手翻到。', src: 'assets/screen-music.png', description: '本地音乐资料库的封面浏览，展示项目的 Prism 示例素材。' },
  reader: { title: '把一段文字，放进口袋。', src: 'assets/screen-reader.png', description: '真实阅读页与项目原创示例「棱镜随记」。自然语音需服务或有效缓存，格式边界见版本说明。' },
  calendar: { title: '看看今天，翻翻下个月。', src: 'assets/screen-calendar.png', description: '日历月视图的设备捕获；这张图不代表联网订阅已完成验证。' },
};

for (const button of document.querySelectorAll('[data-dialog]')) {
  button.addEventListener('click', () => document.getElementById(button.dataset.dialog)?.showModal());
}

for (const button of document.querySelectorAll('[data-screen]')) {
  button.addEventListener('click', () => {
    const screen = screens[button.dataset.screen];
    if (!screen) return;
    const image = document.getElementById('screen-image');
    image.src = screen.src;
    image.alt = button.querySelector('img').alt;
    document.getElementById('screen-title').textContent = screen.title;
    document.getElementById('screen-description').textContent = screen.description;
    document.getElementById('screen-dialog').showModal();
  });
}

for (const dialog of document.querySelectorAll('dialog')) {
  dialog.querySelector('.dialog-close')?.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });
}
