/*
document.getElementById('targetArea').addEventListener('click', function() {
    document.getElementById('selectionModal').style.display = 'block';
});

document.getElementById('selectionModal').addEventListener('click', function(event) {
    if (event.target.id === 'selectionModal') {
        document.getElementById('selectionModal').style.display = 'none';
    }
});*/
//聖遺物選択モーダル

// 対象エリアを取得
const targetArea = document.getElementById("targetArea");

// モーダルウィンドウを取得
const modal = document.getElementById("modal");

// モーダルウィンドウ内の画像アイテムを取得
const imageItems = document.getElementsByClassName("image-item");

// 対象エリアをクリックした際の処理
targetArea.addEventListener("click", function() {
  // モーダルウィンドウを表示
  modal.style.display = "block";
});

//モーダルウィンドウの外をクリックした際の処理
modal.addEventListener("click", function(event) {
    if (event.target.id === "modal") {
        modal.style.display = "none";
    }
});


// モーダルウィンドウ内の画像アイテムをクリックした際の処理
for (let i = 0; i < imageItems.length; i++) {
  imageItems[i].addEventListener("click", function() {
    // 選択した画像のURLとテキストを取得
    const imageUrl = this.getAttribute("data-image-url");
    const imageText = this.getAttribute("data-image-text");

    // 選択した画像を対象エリアに表示
    targetArea.innerHTML = `<img src="${imageUrl}" alt="${imageText}" />` + imageText;
    // モーダルウィンドウを非表示にする
    modal.style.display = 'none';
  });
}