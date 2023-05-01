//ボタンを押したときの処理
function calc(){
    //ここに処理を書く
    //基礎ダメージ
    let atk = parseFloat(document.getElementById("atk").value);
    let base_atk = parseFloat(document.getElementById("base_atk").value);
    let atk_buffPer = parseFloat(document.getElementById("atk_buffPer").value);
    let atk_buffPlus = parseFloat(document.getElementById("atk_buffPlus").value);
    let talent = parseFloat(document.getElementById("talent").value);
    //ダメバフ・率ダメ・被ダメ
    let dmg_b = parseFloat(document.getElementById("dmg_b").value);
    let cri_dmg = parseFloat(document.getElementById("cri_dmg").value);
    let taken_dmg = parseFloat(document.getElementById("taken_dmg").value);
    //デバフ
    let ele_d = parseFloat(document.getElementById("ele_d").value);
    let def_d = parseFloat(document.getElementById("def_d").value);
    let def_ig = parseFloat(document.getElementById("def_ig").value);
    //敵味方のデータ
    let lv = parseFloat(document.getElementById("lv").value);
    let e_lv = parseFloat(document.getElementById("e_lv").value);
    //let e_res = parseFloat(document.getElementById("e_res").value);

    //基礎ダメージ計算
    var value_base_dmg = (atk + (base_atk*atk_buffPer/100) + atk_buffPlus) * (talent/100);
    //ダメバフ・率ダメ・被ダメ
    var value_dmg_b = 1 + dmg_b/100;
    var value_cri_dmg = 1 + cri_dmg/100;
    var value_taken_dmg = 1 + taken_dmg/100;

    //まとめ
    let value_sum_dmg_b = value_dmg_b * value_cri_dmg * value_taken_dmg;

    //敵の靭性・弱点計算
    let toughnessSelect = document.getElementById("toughness");
    let weaknessSelect = document.getElementById("weakness");
    var toughness = 1;
    var weakness = 1;
    if(toughnessSelect.value == "yes"){
        toughness = 0.9;
    }else{
        toughness = 1;
    }
    if(weaknessSelect.value == "yes"){
        weakness = 1;
    }else{
        weakness = 0.8;
    }


    //敵の防御・耐性計算
    //ダメージ計算でのレベル＋FIXLV
    const FIXLV = 20;
    let value_e_def = (lv+FIXLV)/((1 - def_ig/100) * (1 - def_d/100) * (e_lv+FIXLV) + lv+FIXLV);
    let value_toughness = toughness;
    let value_weakness = weakness - (ele_d/100);
    
    
    
    let result = value_base_dmg * value_sum_dmg_b * value_e_def * value_toughness * value_weakness;
    document.getElementById("value_e_def").innerHTML = value_e_def;
    document.getElementById("value_e_ele").innerHTML = value_weakness;
    document.getElementById("result").innerHTML = "ダメージ結果：" + result;

/*
    // データを更新
    //valueというあたいはmain.jsの変数です。使用の際はスコープしてください
    data[0].value = value_dmg_b;
    data[1].value = value_cri_dmg;
    data[2].value = value_ele;
    
    if(data[0].value == 1){
        data[0].value = 0;
    }
    if(data[1].value == 1){
        data[1].value = 0;
    }
    if(data[2].value == 1){
        data[2].value = value_ele_other;
    }
    // 円グラフのデータを更新
    myChart.data.datasets[0].data = data.map(function(item) { return item.value; });
    // 円グラフを再描画
    myChart.update();*/
    
    console.log("calc()");
    
}


//元素反応の選択肢
var eleArea = document.getElementById('eleArea');
var eleChoices = document.getElementById('eleChoices');
var eleChoiceItems = document.querySelectorAll('#eleChoices li');
var eleChoiceList = Array.from(eleChoiceItems); // 選択肢のリストを配列に変換

var ele = 1;

// 非表示要素を取得
const eleContent = document.getElementById('eleCalcContent');
const normalDmgContent = document.getElementById('normalDmgContent');

eleArea.addEventListener('click', function() {
    // 選択肢ウィンドウを表示/非表示に切り替える
    if (eleChoices.style.display === 'none' || eleChoices.style.display === '') {
        eleChoices.style.display = 'block';
    } else {
        eleChoices.style.display = 'none';
    }
});

// 選択肢がクリックされた時の処理
for (var i = 0; i < eleChoiceItems.length; i++) {
    eleChoiceItems[i].addEventListener('click', function() {
        var selectedChoice = this.textContent;
        eleArea.textContent = selectedChoice;
        eleChoices.style.display = 'none';

        //選択された値を取得
        switch(eleChoiceList.indexOf(this)){
            case 0:
                //反応なし
                ele = 1;
                eleContent.style.display = 'none';
                normalDmgContent.style.display = 'block';
                break;
            case 1:
                //蒸発溶解1.5倍
                ele = 1.5;
                eleContent.style.display = 'block';
                normalDmgContent.style.display = 'block';
                break;
            case 2:
                //蒸発溶解2倍
                ele = 2;
                eleContent.style.display = 'block';
                normalDmgContent.style.display = 'block';
                break;
            case 3:
                //超激化係数1.15倍
                ele = 0.15;
                eleContent.style.display = 'block';
                normalDmgContent.style.display = 'block';
                break;
            case 4:
                //草激化係数1.25倍
                ele = 0.25;
                eleContent.style.display = 'block';
                normalDmgContent.style.display = 'block';
                break;
            case 5:
                //その他元素反応
                ele = 1;
                eleContent.style.display = 'block';
                normalDmgContent.style.display = 'none';
                break;
            default:
                //例外処理
                ele = 1;
                eleContent.style.display = 'block';
                normalDmgContent.style.display = 'block';
                break;
        }
        //console.log(eleChoiceList.indexOf(this));
    });
}




// 初期の円グラフのデータ
var data = [
    //{ label: '基礎ダメージ', value: 0, color: "yellow" },
    { label: 'ダメバフ補正', value: 1, color: 'blue' },
    { label: '会心ダメ補正', value: 1, color: 'green' },
    { label: '元素反応', value: 1, color: 'red' },/*
    { label: '敵防御', value: 1, color: 'brown' },
    { label: '敵元素耐性', value: 1, color: 'purple' }*/
  ];
  
  // グラフのオプションを設定する
  var options = {
    responsive: true,
    maintainAspectRatio: false,
  };
  
  
  // 円グラフを描画する
  // Chart.jsを使用して円グラフを描画
  var canvas = document.getElementById("myChart");
  var ctx = canvas.getContext("2d");
  //var ctx = document.getElementById("chart").getContext('2d');
  var myChart = new Chart(ctx, {
    type: 'pie',
    data: {
    labels: data.map(function(item) { return item.label; }),
    datasets: [{
        data: data.map(function(item) { return item.value; }),
        backgroundColor: data.map(function(item) { return item.color; })
    }]
    },
    options: options
  });
  
