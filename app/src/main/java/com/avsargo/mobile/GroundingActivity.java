package com.avsargo.mobile;
import android.app.Activity;
import android.os.Bundle;
import android.content.Intent;
import android.net.Uri;
import android.webkit.*;
import android.widget.*;
import org.json.*;
/** Provider attribution is shown with its answer. Remote HTML never receives a native bridge. */
public final class GroundingActivity extends Activity {
 private WebView web;
 static String escape(String s){return s.replace("&","&amp;").replace("<","&lt;").replace(">","&gt;").replace("\"","&quot;").replace("'","&#39;");}
 @Override public void onCreate(Bundle state){super.onCreate(state);LinearLayout box=new LinearLayout(this);box.setOrientation(1);Button back=new Button(this);back.setText("Back to conversation");back.setOnClickListener(v->finish());box.addView(back);web=new WebView(this);WebSettings s=web.getSettings();s.setJavaScriptEnabled(false);s.setAllowFileAccess(false);s.setAllowContentAccess(false);s.setDomStorageEnabled(false);s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);box.addView(web,new LinearLayout.LayoutParams(-1,0,1));setContentView(box);web.setWebViewClient(new WebViewClient(){@Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){Uri u=request.getUrl();if("https".equals(u.getScheme())&&u.getUserInfo()==null)try{startActivity(new Intent(Intent.ACTION_VIEW,u));}catch(Exception ignored){}return true;}});
  try{JSONObject r=new JSONObject(getIntent().getStringExtra("research"));StringBuilder html=new StringBuilder("<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'><meta http-equiv='Content-Security-Policy' content=\"default-src https:; script-src 'none'; style-src 'unsafe-inline'; object-src 'none'; frame-src 'none'\"><style>body{background:#17181a;color:#f5f5f5;padding:22px;font:16px/1.7 sans-serif}h2{font-size:24px}article{white-space:pre-wrap}a{color:#d2f2e2}li{margin:16px 0}</style></head><body><h2>Official live sources</h2><small>");html.append(escape(r.optString("searchedAt"))).append("</small><article>").append(escape(r.optString("text"))).append("</article><ul>");JSONArray sources=r.optJSONArray("sources");if(sources!=null)for(int i=0;i<sources.length();i++){JSONObject source=sources.getJSONObject(i);Uri u=Uri.parse(source.optString("url"));if("https".equals(u.getScheme())&&u.getUserInfo()==null)html.append("<li><a href='"+escape(u.toString())+"'>"+escape(source.optString("title"))+" ↗</a></li>");}html.append("</ul>").append(r.optString("suggestions")).append("</body></html>");web.loadDataWithBaseURL("https://search-results.avsargo.invalid/",html.toString(),"text/html","UTF-8",null);}catch(Exception e){web.loadData("Results unavailable","text/html","UTF-8");}
 }
 @Override protected void onDestroy(){web.destroy();super.onDestroy();}
}
