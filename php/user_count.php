<?php
// セッションを開始
session_start();

// 現在のセッションIDを取得
$currentSessionId = session_id();

// セッションデータに現在のユーザ数を格納
$_SESSION[$currentSessionId]['user_count'] = 1; // サンプルでは常に1人のユーザを表示しています

// 現在のユーザ数を返す
echo $_SESSION[$currentSessionId]['user_count'];
?>
