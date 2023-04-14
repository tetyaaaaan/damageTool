//ボタンを押したときの処理
function calc(){
    //ここに処理を書く
    //基礎ダメージ
    let atk = parseFloat(document.getElementById("atk").value);
    let talent = parseFloat(document.getElementById("talent").value);
    let special = parseFloat(document.getElementById("special").value);
    let add_b = parseFloat(document.getElementById("add_b").value);
    //ダメバフ・率ダメ・元素反応
    let dmg_b = parseFloat(document.getElementById("dmg_b").value);
    let cri_dmg = parseFloat(document.getElementById("cri_dmg").value);
    let ele = parseFloat(document.getElementById("ele").value);
    let ele_m = parseFloat(document.getElementById("ele_m").value);
    let ele_e = parseFloat(document.getElementById("ele_e").value);
    //デバフ
    let ele_d = parseFloat(document.getElementById("ele_d").value);
    let def_d = parseFloat(document.getElementById("def_d").value);
    let def_ig = parseFloat(document.getElementById("def_ig").value);
    //敵味方のデータ
    let lv = parseFloat(document.getElementById("lv").value);
    let e_lv = parseFloat(document.getElementById("e_lv").value);
    let e_res = parseFloat(document.getElementById("e_res").value);

    //基礎ダメージ計算
    let value_base_dmg = atk * (talent/100) * (1 +special/100) + add_b;
    //ダメバフ・率ダメ・元素反応計算
    let value_dmg_b = (1 + dmg_b/100) * (1 + cri_dmg/100) * (ele * (1+ele_m/100 * ele_e/100));
    //敵の防御・元素耐性計算
    let value_e_def = (lv+100)/((1 - def_ig/100) * (1 - def_d/100) * (e_lv+100) + lv+100);
    let value_e_ele_now = e_res - ele_d;
    let value_e_ele = 0;
    if(value_e_ele_now < 0){
        value_e_ele = 1 - value_e_ele_now/200;
    }else if(value_e_ele_now < 75){
        value_e_ele = 1 - value_e_ele_now/100;
    }else{
        value_e_ele = 1 / (value_e_ele_now/25 + 1);
    }
    



    let def = 0//parseFloat(document.getElementById("def").value);
    let result = value_base_dmg * value_dmg_b * value_e_def * value_e_ele;
    document.getElementById("value_e_def").innerHTML = "敵防御補正：" + value_e_def;
    document.getElementById("value_e_ele").innerHTML = "敵元素耐性補正：" + value_e_ele;
    document.getElementById("result").innerHTML = "ダメージ結果：" + result;

    console.log("calc");
}