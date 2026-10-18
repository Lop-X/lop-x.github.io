var posts=["Hello World/","Workbuddy初体验/","hexo配置bangumi追番页面/","使用obsidian编辑笔记/","关于Ai在独立游戏开发中的使用看法/","常见Git命令学习/","智能汽车竞赛/","用easyX制作Snake-Game/","网站装修记录/","考研记录（一）/","考研记录（二）/"];function toRandomPost(){
    pjax.loadUrl('/'+posts[Math.floor(Math.random() * posts.length)]);
  };