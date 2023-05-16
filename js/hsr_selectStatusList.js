let chaStatus;
let weaStatus;

// CSVファイルを読み込む関数
function loadCharaCSV() {
    // CSVファイルのパス
    const csvFilePath = "./data/hsr/data_hsr_cha.csv";

    // 名前を選択するセレクトボックス
    const selectName = document.getElementById("selectName");
    // テーブルのthead
    const tableHead = document.querySelector("#chara-outputTable thead");
    // テーブルのtbody
    const tableBody = document.querySelector("#chara-outputTable tbody");

    // CSVファイルを読み込む
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
                        td.setAttribute("id", "cha_"+headerRow[j]);
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
                            td.setAttribute("id", "cha_"+headerRow[j]);
                            tr.appendChild(td);
                        }
                        tableBody.appendChild(tr);
                    }
                }
                sumStatus();
                gtag('event', 'click_stsList', {
                    'event_category': 'select',
                    'event_label': 'stsList'
                });
            });
        }
    };
    xhr.send();
}

// CSVファイルを読み込む関数
function loadWeaponCSV() {
    // CSVファイルのパス
    const csvFilePath = "./data/hsr/data_hsr_weapon.csv";

    // 名前を選択するセレクトボックス
    const selectName = document.getElementById("selectWeapon");
    // テーブルのthead
    const tableHead = document.querySelector("#weapon-outputTable thead");
    // テーブルのtbody
    const tableBody = document.querySelector("#weapon-outputTable tbody");
    //テーブルのtfoot
    const tableFoot = document.querySelector("#weapon-outputTable tfoot");

    // CSVファイルを読み込む
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
                selectName.value = "null";
            }

            // 名前を選択するセレクトボックスの値が変更された時の処理
            selectName.addEventListener("change", function () {
            
                // テーブルの中身をクリアする
                tableBody.innerHTML = "<tr><th colspan='2'>名前</th><th>★</th><th>運命</th></tr>";

                // 選択された名前に対応する行をテーブルに追加する
                const selectedName = this.value;
                for (let i = 1; i < csvRows.length; i++) {
                    const row = csvRows[i].split(",");
                    if (row[1] === selectedName) {
                        const tr = document.createElement("tr");
                        for (let j = 1; j < 4; j++) {
                            if(j == 1){
                                const td = document.createElement("td");
                                td.textContent = row[j];
                                td.setAttribute("id", "wea_"+headerRow[j]);
                                td.setAttribute("colspan", '2');
                                tr.appendChild(td);
                            }
                            else{
                                const td = document.createElement("td");
                                td.textContent = row[j];
                                td.setAttribute("id", "wea_"+headerRow[j]);
                                tr.appendChild(td);
                            }
                        }
                        tableBody.appendChild(tr);
                    }
                }
                // テーブルの中身をクリアする
                tableBody.innerHTML += "<tr><th>HP</th><th>攻撃力</th><th>防御力</th><th>入手方法</th></tr>";

                // 選択された名前に対応する行をテーブルに追加する
                for (let i = 1; i < csvRows.length; i++) {
                    const row = csvRows[i].split(",");
                    if (row[1] === selectedName) {
                        const tr = document.createElement("tr");
                        for (let j = 4; j < 8; j++) {
                            const td = document.createElement("td");
                            td.textContent = row[j];
                            td.setAttribute("id", "wea_"+headerRow[j]);
                            tr.appendChild(td);
                        }
                        tableBody.appendChild(tr);
                    }
                }

                // テーブルの中身をクリアする
                tableBody.innerHTML += "<tr><th colspan='4'>スキル</th></tr>";

                // 選択された名前に対応する行をテーブルに追加する
                for (let i = 1; i < csvRows.length; i++) {
                    const row = csvRows[i].split(",");
                    if (row[1] === selectedName) {
                        const tr = document.createElement("tr");
                        for (let j = 8; j < 9; j++) {
                            const td = document.createElement("td");
                            //td.textContent = row[j];
                            td.innerHTML = row[j];
                            td.setAttribute("id", "wea_"+headerRow[j]);
                            td.setAttribute("colspan", '4');
                            tr.appendChild(td);
                        }
                        tableBody.appendChild(tr);
                    }
                }
                sumStatus();
                gtag('event', 'click_stsList', {
                    'event_category': 'select',
                    'event_label': 'stsList'
                });
            });
        }
    };
    xhr.send();
}

loadCharaCSV();
loadWeaponCSV();

//合計値を表示
function sumStatus() {
    let sumStatus = ["両方選んでね", 0, 0];
    const chaTable = document.querySelector("#chara-outputTable tbody");
    const weaTable = document.querySelector("#weapon-outputTable tbody");
    try{
        const chaHp = chaTable.querySelector("#cha_max_hp").textContent;
        const chaAtk = chaTable.querySelector("#cha_max_atk").textContent;
        const chaDef = chaTable.querySelector("#cha_max_def").textContent;
        const chaAgi = chaTable.querySelector("#cha_max_agi").textContent;

        const weaHp = weaTable.querySelector("#wea_max_hp").textContent;
        const weaAtk = weaTable.querySelector("#wea_max_atk").textContent;
        const weaDef = weaTable.querySelector("#wea_max_def").textContent;
        
        let sumHp = parseInt(chaHp) + parseInt(weaHp);
        let sumAtk = parseInt(chaAtk) + parseInt(weaAtk);
        let sumDef = parseInt(chaDef) + parseInt(weaDef);

        sumStatus = [sumHp, sumAtk, sumDef];
        let headerRow = ["hp", "atk", "def"];

        const tableBody = document.querySelector("#sumStatus-outputTable tbody");
        tableBody.innerHTML = "<br><tr><th>基礎HP</th><th>基礎攻撃力</th><th>基礎防御力</th><th rowspan='2'><button type='button' class='reflect-button' onclick='reflectStatus()'>反映</button></th></tr>";
        const tr = document.createElement("tr");
        for (let j = 0; j < 3; j++) {
            const td = document.createElement("td");
            td.textContent = sumStatus[j];
            td.setAttribute("id", "sumStatus_"+headerRow[j]);
            tr.appendChild(td);
        }
        tableBody.appendChild(tr);
    }
    catch(e){
    }
    //const chaHp = chaTable.querySelector("#cha_max_hp").textContent;
    
    /*
    //const chaHp = document.getElementById("#cha_max_hp");
    const chaAtk = document.getElementById("#cha_max_atk");
    const chaDef = document.getElementById("#cha_max_def");
    const chaAgi = document.getElementById("#cha_max_agi");
    
    const weaAtk = document.getElementById("#wea_max_atk");
    const weaDef = document.getElementById("#wea_max_def");
    
    let sumHp = chaHp + weaHp;
    let sumAtk = chaAtk + weaAtk;
    let sumDef = chaDef + weaDef;

    let sumStatus = [sumHp, sumAtk, sumDef];*/
}

function reflectStatus() {
    if(confirm("基礎ステータスを反映しますか？\n※画面下の表示・基礎攻撃力が変更されます")){
        //input要素を取得
        const chaBaseAtk = document.querySelector("#base_atk");
        const chaAtk = document.querySelector("#atk");
        const sumStatus = document.querySelector("#sumStatus-outputTable tbody").querySelector("#sumStatus_atk").textContent;
        const diff_atk = chaAtk.value - chaBaseAtk.value;
        chaBaseAtk.value = sumStatus;
        chaAtk.value = parseInt(sumStatus) + diff_atk;
        console.log("反映されました");
    }else{
        console.log("キャンセルされました");
    }
}
