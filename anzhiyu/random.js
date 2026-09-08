var posts=["网站搭建/已复活/","uncategorized/考研记录（一）/","网站搭建/网站装修记录/"];function toRandomPost(){
    pjax.loadUrl('/'+posts[Math.floor(Math.random() * posts.length)]);
  };