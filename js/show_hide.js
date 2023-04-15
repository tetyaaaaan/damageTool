// アイコンを取得
const toggleButton = document.getElementById('toggleButton');

// 非表示要素を取得
const toggleContent = document.getElementById('toggleContent');

// アイコンをクリックした際の処理
toggleButton.addEventListener('click', function() {
  if (toggleContent.style.display === 'none') {
    // 非表示要素を表示し、アイコンを「ー」に変更
    toggleContent.style.display = 'block';
    toggleButton.textContent = 'ー';
  } else {
    // 非表示要素を非表示にし、アイコンを「＋」に変更
    toggleContent.style.display = 'none';
    toggleButton.textContent = '＋';
  }
});