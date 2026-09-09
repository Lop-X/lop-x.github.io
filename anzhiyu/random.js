var posts=["uncategorized/hexo配置bangumi追番页面/","网站搭建/已复活/","网站搭建/网站装修记录/","uncategorized/考研记录（一）/"];function toRandomPost(){
    pjax.loadUrl('/'+posts[Math.floor(Math.random() * posts.length)]);
  };