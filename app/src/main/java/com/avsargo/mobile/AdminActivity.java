package com.avsargo.mobile;

import android.app.Activity;
import android.os.Bundle;
import android.graphics.Color;
import android.net.Uri;
import android.view.Gravity;
import android.view.WindowInsets;
import android.webkit.*;
import android.widget.*;

/** Separate origin-restricted admin browser; no native JavaScript bridge. */
public final class AdminActivity extends Activity {
    private WebView web;
    private TextView status;
    private int dp(int value){return Math.round(value*getResources().getDisplayMetrics().density);}
    @Override public void onCreate(Bundle state){
        setTheme(android.R.style.Theme_Material_NoActionBar);super.onCreate(state);if(android.os.Build.VERSION.SDK_INT>=30)getWindow().setDecorFitsSystemWindows(false);
        if(android.os.Build.VERSION.SDK_INT>=33)getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT,this::onBackPressed);
        getWindow().setStatusBarColor(Color.rgb(21,22,25));getWindow().setNavigationBarColor(Color.rgb(21,22,25));
        LinearLayout layout=new LinearLayout(this);layout.setOrientation(LinearLayout.VERTICAL);layout.setBackgroundColor(Color.rgb(21,22,25));
        layout.setOnApplyWindowInsetsListener((v,insets)->{if(android.os.Build.VERSION.SDK_INT>=30){android.graphics.Insets safe=insets.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.displayCutout()|WindowInsets.Type.ime());v.setPadding(safe.left,safe.top,safe.right,safe.bottom);}return insets;});
        LinearLayout toolbar=new LinearLayout(this);toolbar.setGravity(Gravity.CENTER_VERTICAL);toolbar.setPadding(dp(8),dp(4),dp(8),dp(4));
        Button back=new Button(this);back.setText("‹");back.setAllCaps(false);back.setTextColor(Color.WHITE);back.setBackgroundTintList(android.content.res.ColorStateList.valueOf(Color.rgb(36,37,42)));toolbar.addView(back,new LinearLayout.LayoutParams(dp(42),dp(44)));back.setOnClickListener(v->finish());
        status=new TextView(this);status.setText("Owner admin");status.setTextColor(Color.WHITE);status.setTextSize(13);status.setPadding(dp(12),0,0,0);toolbar.addView(status,new LinearLayout.LayoutParams(0,-2,1));
        Button reload=new Button(this);reload.setText("↻");reload.setTextColor(Color.WHITE);reload.setBackgroundTintList(android.content.res.ColorStateList.valueOf(Color.rgb(36,37,42)));toolbar.addView(reload,new LinearLayout.LayoutParams(dp(42),dp(44)));reload.setOnClickListener(v->web.reload());layout.addView(toolbar);
        web=new WebView(this);web.setBackgroundColor(Color.rgb(21,22,25));WebSettings s=web.getSettings();s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);s.setAllowFileAccess(false);s.setAllowContentAccess(false);s.setAllowFileAccessFromFileURLs(false);s.setAllowUniversalAccessFromFileURLs(false);s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);s.setSafeBrowsingEnabled(true);
        CookieManager.getInstance().setAcceptCookie(true);CookieManager.getInstance().setAcceptThirdPartyCookies(web,false);
        web.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest r){return !allowed(r.getUrl());}
            @Override public WebResourceResponse shouldInterceptRequest(WebView v,WebResourceRequest r){return allowed(r.getUrl())?null:new WebResourceResponse("text/plain","UTF-8",new java.io.ByteArrayInputStream(new byte[0]));}
            @Override public void onPageFinished(WebView v,String url){status.setText("Owner admin");}
            @Override public void onReceivedSslError(WebView v,SslErrorHandler h,android.net.http.SslError e){h.cancel();status.setText("Secure connection failed");}
            @Override public void onReceivedError(WebView v,WebResourceRequest r,WebResourceError e){if(r.isForMainFrame())status.setText("Could not load · tap ↻ to retry");}
        });
        web.setWebChromeClient(new WebChromeClient(){@Override public boolean onJsConfirm(WebView v,String u,String msg,JsResult result){new android.app.AlertDialog.Builder(AdminActivity.this).setMessage(msg).setPositiveButton("OK",(d,w)->result.confirm()).setNegativeButton("Cancel",(d,w)->result.cancel()).setOnCancelListener(d->result.cancel()).show();return true;}});
        layout.addView(web,new LinearLayout.LayoutParams(-1,0,1));setContentView(layout);layout.requestApplyInsets();web.loadUrl(BackendClient.BASE+"/admin");
    }
    private boolean allowed(Uri uri){return "https".equals(uri.getScheme())&&Uri.parse(BackendClient.BASE).getHost().equals(uri.getHost())&&uri.getUserInfo()==null&&(uri.getPort()==-1||uri.getPort()==443);}
    @Override public void onBackPressed(){if(web.canGoBack())web.goBack();else finish();}
    @Override protected void onPause(){web.onPause();CookieManager.getInstance().flush();super.onPause();}
    @Override protected void onResume(){super.onResume();if(web!=null)web.onResume();}
    @Override protected void onDestroy(){if(web!=null)web.destroy();super.onDestroy();}
}
