package com.foxmaybe.wangzheaccountmanager;

import android.graphics.Color;
import android.os.Bundle;
import android.view.View;

import com.getcapacitor.BridgeActivity;

/**
 * 王者多账号管理器的 Android Capacitor 容器。
 *
 * 业务与路由保留在 Vue 层；Activity 负责 WebView 容器、系统栏配色和禁止边缘回弹。
 * 系统返回键通过 @capacitor/app 回传给前端，由前端按弹窗、编辑态和页面历史处理。
 */
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getWindow().setStatusBarColor(Color.parseColor("#1D3157"));
        getWindow().setNavigationBarColor(Color.parseColor("#1D3157"));
        getWindow().getDecorView().setSystemUiVisibility(
            getWindow().getDecorView().getSystemUiVisibility() & ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
        );

        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().setOverScrollMode(View.OVER_SCROLL_NEVER);
            getBridge().getWebView().setVerticalScrollBarEnabled(false);
        }
    }
}
