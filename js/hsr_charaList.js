// CSVファイルを読み込む関数
// CSVファイルのパス
const csvFilePath = "./data/hsr/data_hsr_cha.csv";

// 名前を選択するセレクトボックス
const selectName = document.getElementById("selectName");
// テーブルのthead
const tableHead = document.querySelector("#outputTable thead");
// テーブルのtbody
const tableBody = document.querySelector("#outputTable tbody");

// CSVファイルを読み込む
const xhr = new XMLHttpRequest();
xhr.open("GET", csvFilePath);
xhr.onreadystatechange = function () {
    if (xhr.readyState === XMLHttpRequest.DONE && xhr.status === 200) {
        const csvData = xhr.responseText;

        // CSVデータをパースする
        const csvRows = csvData.split(/\r?\n/);

        // ヘッダー行を配列として取得する
        const headerRow = csvRows[0].split(",");

        // 名前を選択するセレクトボックスにオプションを追加する
        for (let i = 1; i < csvRows.length; i++) {
            const row = csvRows[i].split(",");
            const name = row[1];
            const option = document.createElement("option");
            option.value = name;
            option.textContent = name;
            selectName.appendChild(option);
            selectName.value = "null";
        }

        // 名前を選択するセレクトボックスの値が変更された時の処理
        selectName.addEventListener("change", function () {
          
          // テーブルの中身をクリアする
          tableHead.innerHTML = "<tr><th>名前</th><th>★</th><th>属性</th><th>運命</th></tr>";

          // 選択された名前に対応する行をテーブルに追加する
          const selectedName1 = this.value;
          for (let i = 1; i < csvRows.length; i++) {
              const row = csvRows[i].split(",");
              if (row[1] === selectedName1) {
                  const tr = document.createElement("tr");
                  for (let j = 1; j < 5; j++) {
                      const td = document.createElement("td");
                      td.textContent = row[j];
                      tr.appendChild(td);
                  }
                  tableHead.appendChild(tr);
              }
          }
            // テーブルの中身をクリアする
            tableBody.innerHTML = "<tr><th>HP</th><th>攻撃力</th><th>防御力</th><th>速度</th></tr>";

            // 選択された名前に対応する行をテーブルに追加する
            const selectedName2 = this.value;
            for (let i = 1; i < csvRows.length; i++) {
                const row = csvRows[i].split(",");
                if (row[1] === selectedName2) {
                    const tr = document.createElement("tr");
                    for (let j = 5; j < 9; j++) {
                        const td = document.createElement("td");
                        td.textContent = row[j];
                        tr.appendChild(td);
                    }
                    tableBody.appendChild(tr);
                }
            }
        });
    }
};
xhr.send();