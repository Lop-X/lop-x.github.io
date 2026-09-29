var posts=["建站/hexo配置bangumi追番页面/","Git/常见Git命令学习/","工具/使用obsidian编辑笔记/","建站/已复活/","游戏开发/用easyX制作Snake-Game/","考研/考研记录（一）/","建站/网站装修记录/","考研/考研记录（二）/"];function toRandomPost(){
    pjax.loadUrl('/'+posts[Math.floor(Math.random() * posts.length)]);
  };