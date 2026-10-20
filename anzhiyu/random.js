var posts=["Hello World/","Workbuddy初体验/","hexo配置bangumi追番页面/","使用obsidian编辑笔记/","常见Git命令学习/","智能汽车竞赛/","用easyX制作Snake-Game/","网站装修记录/","考研记录（一）/","考研记录（二）/","关于Ai在独立游戏的应用/","测试1/"];function toRandomPost(){
    pjax.loadUrl('/'+posts[Math.floor(Math.random() * posts.length)]);
  };