var posts=["2026/09/07/已复活/","2026/09/07/anzhiyu-themes/"];function toRandomPost(){
    pjax.loadUrl('/'+posts[Math.floor(Math.random() * posts.length)]);
  };