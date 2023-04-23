// サーバーにユーザ数を取得するリクエストを送信
function getUserCount() {
  var xhr = new XMLHttpRequest();
  xhr.open('GET', './php/user_count.php', true);
  xhr.onreadystatechange = function() {
    if (xhr.readyState === XMLHttpRequest.DONE) {
      if (xhr.status === 200) {
        // 取得したユーザ数を表示
        document.getElementById('userCount').innerText = xhr.responseText;
      } else {
        console.error('ユーザ数の取得に失敗しました');
      }
    }
  };
  xhr.send();
}

// 定期的にユーザ数を更新
setInterval(getUserCount, 1000); // 1秒ごとにユーザ数を更新する例
