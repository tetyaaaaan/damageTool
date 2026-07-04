// 遺物データ表示の切り替え用。UI刷新時に表示条件を集約する。
function artifactDisplay() {
    // 現在は常時表示のため、処理はartifactSelect側で行う。
}
// 遺物セットの選択方式に応じて入力欄を切り替える。
function artifactSelect() {
    var selectBox = document.getElementsByName("arti_selectBox")[0];
    var selectedOption = selectBox.options[selectBox.selectedIndex];

    if (selectedOption.value == "arti_option1") {
        document.getElementById("select-artifact-container1").style.display = "block";
        document.getElementById("select-artifact-container2").style.display = "none";
      } else if (selectedOption.value == "arti_option2") {
        document.getElementById("select-artifact-container1").style.display = "none";
        document.getElementById("select-artifact-container2").style.display = "block";
      }
}

// 4セット選択用の遺物CSVを読み込む
function loadArtifact1CSV() {
    // 元データCSV
    const csvFilePath = "/games/data/hsr/data_hsr_artifact.csv";

    // 遺物名の選択欄
    const selectName = document.getElementById("selectArtifact1");
    // 選択結果の表示先
    const tableBody = document.querySelector("#artifact-outputTable1 tbody");

    // CSVを読み込み、type=1の遺物だけを選択肢へ反映する
    const xhr = new XMLHttpRequest();
    xhr.open("GET", csvFilePath);
    xhr.onreadystatechange = function () {
        if (xhr.readyState === XMLHttpRequest.DONE && xhr.status === 200) {
            const csvData = xhr.responseText;

            // 現在のCSVは半角カンマを含まない前提で読み込む
            const csvRows = csvData.split(/\r?\n/);
            csvRows.pop();

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
                //selectName.value = "null";
            }

            // 名前を選択するセレクトボックスのフィルタリング
            for (let i = 1; i < csvRows.length; i++) {
                const row = csvRows[i].split(",");
                if (row[2] != "1") {
                    const options = selectName.querySelectorAll("option");
                    options.forEach((option) => {
                        if (option.value === row[1]) {
                            option.remove();
                        }
                    });
                }
                selectName.value = "null";
            }

            // 名前を選択するセレクトボックスの値が変更された時の処理
            selectName.addEventListener("change", function () {

                // 選択中のデータ行を表示する
                const selectedName = this.value;
                for (let i = 1; i < csvRows.length; i++) {
                    const row = csvRows[i].split(",");

                    if (row[1] === selectedName) {
                        // 前回の表示内容をリセットする
                        tableBody.innerHTML = "<tr><th>名前</th><th>2セット効果</th></tr>";
                        
                        var tr = document.createElement("tr");
                        var td = document.createElement("td");
                        td.textContent = row[1];
                        td.setAttribute("id", "arti_"+headerRow[1]);
                        tr.appendChild(td);

                        var td = document.createElement("td");
                        td.textContent = row[3];
                        td.setAttribute("id", "arti_"+headerRow[3]);
                        tr.appendChild(td);
                        tableBody.appendChild(tr);

                        // 前回の表示内容をリセットする
                        tableBody.innerHTML += "<tr><th colspan='2'>4セット効果</th></tr>";
                        var tr = document.createElement("tr");
                        var td = document.createElement("td");
                        td.textContent = row[4];
                        td.setAttribute("id", "arti_"+headerRow[4]);
                        td.setAttribute("colspan", '2');
                        tr.appendChild(td);
                        tableBody.appendChild(tr);
                    }
                }
            });
        }
    };
    xhr.send();
}

// CSVから選択候補と表示データを作成する
function loadArtifact2CSV() {
    // 元データCSV
    const csvFilePath = "/games/data/hsr/data_hsr_artifact.csv";

    // 名前を選択するセレクトボックス
    const selectName1 = document.getElementById("selectArtifact2-1");
    const selectName2 = document.getElementById("selectArtifact2-2");
    // テーブルのtbody
    const tableBody1 = document.querySelector("#artifact-outputTable2-1 tbody");
    const tableBody2 = document.querySelector("#artifact-outputTable2-2 tbody");

    // CSVを読み込んで画面へ反映する
    const xhr = new XMLHttpRequest();
    xhr.open("GET", csvFilePath);
    xhr.onreadystatechange = function () {
        if (xhr.readyState === XMLHttpRequest.DONE && xhr.status === 200) {
            const csvData = xhr.responseText;

            // CSVデータをパースする
            const csvRows = csvData.split(/\r?\n/);
            csvRows.pop();

            // ヘッダー行を配列として取得する
            const headerRow = csvRows[0].split(",");

            // 名前を選択するセレクトボックスにオプションを追加する
            for (let i = 1; i < csvRows.length; i++) {
                const row = csvRows[i].split(",");
                const name = row[1];
                const option = document.createElement("option");
                option.value = name;
                option.textContent = name;
                selectName1.appendChild(option);
            }
            for (let i = 1; i < csvRows.length; i++) {
                const row = csvRows[i].split(",");
                const name = row[1];
                const option = document.createElement("option");
                option.value = name;
                option.textContent = name;
                selectName2.appendChild(option);
            }

            // 名前を選択するセレクトボックスのフィルタリング
            for (let i = 1; i < csvRows.length; i++) {
                const row = csvRows[i].split(",");
                if (row[2] != "1") {
                    const options1 = selectName1.querySelectorAll("option");
                    const options2 = selectName2.querySelectorAll("option");
                    options1.forEach((option) => {
                        if (option.value === row[1]) {
                            option.remove();
                        }
                    });
                    options2.forEach((option) => {
                        if (option.value === row[1]) {
                            option.remove();
                        }
                    });
                }
                selectName1.value = "null";
                selectName2.value = "null";
            }

            // 名前を選択するセレクトボックスの値が変更された時の処理
            selectName1.addEventListener("change", function () {

                // 選択中のデータ行を表示する
                const selectedName = this.value;
                for (let i = 1; i < csvRows.length; i++) {
                    const row = csvRows[i].split(",");

                    if (row[1] === selectedName) {
                        // 前回の表示内容をリセットする
                        tableBody1.innerHTML = "<tr><th>名前</th><th>2セット効果</th></tr>";
                        
                        var tr = document.createElement("tr");
                        var td = document.createElement("td");
                        td.textContent = row[1];
                        td.setAttribute("id", "arti_"+headerRow[1]);
                        tr.appendChild(td);

                        var td = document.createElement("td");
                        td.textContent = row[3];
                        td.setAttribute("id", "arti_"+headerRow[3]);
                        tr.appendChild(td);
                        tableBody1.appendChild(tr);
                    }
                }
            });

            // 名前を選択するセレクトボックスの値が変更された時の処理
            selectName2.addEventListener("change", function () {

                // 選択中のデータ行を表示する
                const selectedName = this.value;
                for (let i = 1; i < csvRows.length; i++) {
                    const row = csvRows[i].split(",");

                    if (row[1] === selectedName) {
                        // 前回の表示内容をリセットする
                        tableBody2.innerHTML = "<tr><th>名前</th><th>2セット効果</th></tr>";
                        
                        var tr = document.createElement("tr");
                        var td = document.createElement("td");
                        td.textContent = row[1];
                        td.setAttribute("id", "arti_"+headerRow[1]);
                        tr.appendChild(td);

                        var td = document.createElement("td");
                        td.textContent = row[3];
                        td.setAttribute("id", "arti_"+headerRow[3]);
                        tr.appendChild(td);
                        tableBody2.appendChild(tr);
                    }
                }
            });
        }
    };
    xhr.send();
}

// CSVから選択候補と表示データを作成する
function loadOrnamentCSV() {
    // 元データCSV
    const csvFilePath = "/games/data/hsr/data_hsr_artifact.csv";

    // 名前を選択するセレクトボックス
    const selectName = document.getElementById("selectOrnament");
    // テーブルのtbody
    const tableBody = document.querySelector("#ornament-outputTable tbody");

    // CSVを読み込んで画面へ反映する
    const xhr = new XMLHttpRequest();
    xhr.open("GET", csvFilePath);
    xhr.onreadystatechange = function () {
        if (xhr.readyState === XMLHttpRequest.DONE && xhr.status === 200) {
            const csvData = xhr.responseText;

            // CSVデータをパースする
            const csvRows = csvData.split(/\r?\n/);
            csvRows.pop();

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
                //selectName.value = "null";
            }

            // 名前を選択するセレクトボックスのフィルタリング
            for (let i = 1; i < csvRows.length; i++) {
                const row = csvRows[i].split(",");
                if (row[2] != "2") {
                    const options = selectName.querySelectorAll("option");
                    options.forEach((option) => {
                        if (option.value === row[1]) {
                            option.remove();
                        }
                    });
                }
                selectName.value = "null";
            }

            // 名前を選択するセレクトボックスの値が変更された時の処理
            selectName.addEventListener("change", function () {

                // 選択中のデータ行を表示する
                const selectedName = this.value;
                for (let i = 1; i < csvRows.length; i++) {
                    const row = csvRows[i].split(",");

                    if (row[1] === selectedName) {
                        // 前回の表示内容をリセットする
                        tableBody.innerHTML = "<tr><th>名前</th><th>2セット効果</th></tr>";
                        
                        var tr = document.createElement("tr");
                        var td = document.createElement("td");
                        td.textContent = row[1];
                        td.setAttribute("id", "arti_"+headerRow[1]);
                        tr.appendChild(td);

                        var td = document.createElement("td");
                        td.textContent = row[3];
                        td.setAttribute("id", "arti_"+headerRow[3]);
                        tr.appendChild(td);
                        tableBody.appendChild(tr);
                    }
                }
            });
        }
    };
    xhr.send();
}


loadArtifact1CSV();
loadArtifact2CSV();
loadOrnamentCSV();


