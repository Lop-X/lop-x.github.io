var posts=["笔记/常见Git命令学习/","笔记/已复活/","笔记/hexo配置bangumi追番页面/","笔记/用easyX制作Snake-Game/","uncategorized/考研记录（一）/","笔记/网站装修记录/"];function toRandomPost(){
    pjax.loadUrl('/'+posts[Math.floor(Math.random() * posts.length)]);
  };