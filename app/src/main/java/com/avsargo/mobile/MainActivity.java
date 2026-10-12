package com.avsargo.mobile;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.res.ColorStateList;
import android.database.Cursor;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.OpenableColumns;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.*;
import android.widget.*;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Trusted bundled chat and untrusted portal use separate WebViews; only chat has a native bridge. */
public final class MainActivity extends Activity {
    private static final int PICK_DOCUMENT=101,PICK_PORTAL_UPLOAD=102;
    private static final String ASSETS="https://appassets.androidplatform.net/assets/";
    private WebView appWeb,siteWeb;
    private LinearLayout browserLayout;
    private TextView browserTitle,browserStatus;
    private ProgressBar browserProgress;
    private SecureVault vault;
    private BackendClient backend;
    private volatile boolean configRefreshing=false;
    private long lastConfigRefresh=0;
    private String helperJs="",lastPromptSignature="",currentPortalUrl="",autoOrigin="";
    private JSONObject cachedProfile=new JSONObject(),cachedMeta=new JSONObject();
    private String pendingUploadLabel="";private final Set<String> attemptedUploads=new HashSet<>();
    private final Handler handler=new Handler(Looper.getMainLooper());
    private final ExecutorService io=Executors.newSingleThreadExecutor();
    private final ArrayList<String> events=new ArrayList<>();
    private ValueCallback<Uri[]> portalFileCallback;
    private WebChromeClient.FileChooserParams uploadParams;
    private boolean uploadActivationPending=false;
    private long uploadActivationId=0;
    private String pendingUploadFieldSignature="";
    private volatile int dataGeneration=0;
    private volatile boolean erasing=false;
    private boolean nextFormAiConsent=false,formAiConsent=false;
    private String aiMappingSignature="",lastAiSignature="";
    private JSONObject aiMappings=new JSONObject();
    private JSONArray pendingUnknown=new JSONArray();
    private boolean browserShown=false,dialogVisible=false,appReady=false,active=false,destroyed=false,scanBusy=false,portalLoading=false;
    private int navigationId=0;
    private final Runnable periodicScan=new Runnable(){public void run(){if(active){scanAndOffer(false);handler.postDelayed(this,2400);}}};

    @Override public void onCreate(Bundle state){
        setTheme(android.R.style.Theme_Material_NoActionBar);super.onCreate(state);
        if(android.os.Build.VERSION.SDK_INT>=30)getWindow().setDecorFitsSystemWindows(false);
        if(android.os.Build.VERSION.SDK_INT>=33)getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT,this::onBackPressed);
        getWindow().setStatusBarColor(Color.rgb(32,33,35));getWindow().setNavigationBarColor(Color.rgb(32,33,35));
        vault=new SecureVault(this);backend=new BackendClient(vault);
        File[] cache=getCacheDir().listFiles();if(cache!=null)for(File f:cache)if(f.getName().startsWith("ocr_")&&f.getName().endsWith(".pdf"))f.delete();
        try(InputStream in=getAssets().open("app/form-agent.js")){helperJs=new String(SecureVault.readLimited(in,64000),StandardCharsets.UTF_8);}catch(Exception ignored){}
        FrameLayout shell=new FrameLayout(this);
        shell.setOnApplyWindowInsetsListener((v,insets)->{
            int left=0,top=0,right=0,bottom=0;
            if(android.os.Build.VERSION.SDK_INT>=30){android.graphics.Insets safe=insets.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.displayCutout()|WindowInsets.Type.ime());left=safe.left;top=safe.top;right=safe.right;bottom=safe.bottom;}
            v.setPadding(left,top,right,bottom);return insets;
        });
        appWeb=new WebView(this);appWeb.setBackgroundColor(Color.rgb(32,33,35));
        configure(appWeb,false);appWeb.getSettings().setBlockNetworkLoads(true);appWeb.getSettings().setAllowContentAccess(false);
        appWeb.addJavascriptInterface(new PrivateBridge(),"AvsarGoNative");
        appWeb.setWebViewClient(new WebViewClient(){
            @Override public WebResourceResponse shouldInterceptRequest(WebView v,WebResourceRequest r){return asset(r.getUrl(),"app/");}
            @Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest r){return !isAppAsset(r.getUrl().toString());}
            @Override public void onPageStarted(WebView v,String u,android.graphics.Bitmap icon){appReady=false;}
            @Override public void onPageFinished(WebView v,String u){appReady=true;for(String event:new ArrayList<>(events))v.evaluateJavascript(event,null);events.clear();}
        });
        appWeb.setWebChromeClient(dialogChrome());shell.addView(appWeb,new FrameLayout.LayoutParams(-1,-1));
        buildBrowser();shell.addView(browserLayout,new FrameLayout.LayoutParams(-1,-1));browserLayout.setVisibility(View.GONE);
        setContentView(shell);shell.requestApplyInsets();appWeb.loadUrl(ASSETS+"app/index.html");
    }
    private void configure(WebView web,boolean portal){
        WebSettings s=web.getSettings();s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);s.setAllowFileAccess(false);s.setAllowContentAccess(portal);
        s.setAllowFileAccessFromFileURLs(false);s.setAllowUniversalAccessFromFileURLs(false);s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setJavaScriptCanOpenWindowsAutomatically(false);s.setSupportMultipleWindows(false);s.setSafeBrowsingEnabled(true);
        if(portal){s.setBuiltInZoomControls(true);s.setDisplayZoomControls(false);s.setUseWideViewPort(true);s.setLoadWithOverviewMode(true);}
    }
    private WebResourceResponse asset(Uri uri,String prefix){
        if(!"https".equals(uri.getScheme())||!"appassets.androidplatform.net".equals(uri.getHost()))return new WebResourceResponse("text/plain","UTF-8",new ByteArrayInputStream(new byte[0]));
        String path=uri.getPath();if(path==null||!path.startsWith("/assets/"+prefix)||path.contains(".."))return new WebResourceResponse("text/plain","UTF-8",new ByteArrayInputStream(new byte[0]));
        try{String file=path.substring(8);String mime=file.endsWith(".js")?"application/javascript":file.endsWith(".css")?"text/css":"text/html";
            return new WebResourceResponse(mime,"UTF-8",getAssets().open(file));}catch(Exception e){return new WebResourceResponse("text/plain","UTF-8",new ByteArrayInputStream(new byte[0]));}
    }
    private static boolean isAppAsset(String url){return url.startsWith(ASSETS+"app/");}
    private int dp(int size){return Math.round(size*getResources().getDisplayMetrics().density);}
    private Button toolbarButton(String text){Button b=new Button(this);b.setText(text);b.setAllCaps(false);b.setTextSize(12);b.setTextColor(Color.WHITE);b.setMinWidth(0);b.setMinimumWidth(0);b.setPadding(dp(8),0,dp(8),0);b.setBackgroundTintList(ColorStateList.valueOf(Color.rgb(48,49,53)));return b;}
    private void buildBrowser(){
        browserLayout=new LinearLayout(this);browserLayout.setOrientation(LinearLayout.VERTICAL);browserLayout.setBackgroundColor(Color.rgb(32,33,35));
        LinearLayout head=new LinearLayout(this);head.setGravity(Gravity.CENTER_VERTICAL);head.setPadding(dp(4),dp(4),dp(4),dp(4));head.setBackgroundColor(Color.rgb(32,33,35));
        Button back=toolbarButton("‹");head.addView(back,new LinearLayout.LayoutParams(dp(42),dp(44)));back.setOnClickListener(v->{if(siteWeb.canGoBack())siteWeb.goBack();else showChat();});
        browserTitle=new TextView(this);browserTitle.setTextSize(11);browserTitle.setTextColor(Color.WHITE);browserTitle.setMaxLines(2);head.addView(browserTitle,new LinearLayout.LayoutParams(0,-2,1));
        Button assist=toolbarButton("Assist");head.addView(assist,new LinearLayout.LayoutParams(-2,dp(44)));assist.setOnClickListener(v->scanAndOffer(true));
        Button documents=toolbarButton("Docs");head.addView(documents,new LinearLayout.LayoutParams(-2,dp(44)));documents.setOnClickListener(v->offerUploadFields());
        Button close=toolbarButton("✕");head.addView(close,new LinearLayout.LayoutParams(dp(42),dp(44)));close.setOnClickListener(v->showChat());
        browserLayout.addView(head,new LinearLayout.LayoutParams(-1,-2));
        browserProgress=new ProgressBar(this,null,android.R.attr.progressBarStyleHorizontal);browserProgress.setMax(100);browserLayout.addView(browserProgress,new LinearLayout.LayoutParams(-1,dp(3)));
        browserStatus=new TextView(this);browserStatus.setTextSize(11);browserStatus.setTextColor(Color.rgb(188,234,213));browserStatus.setPadding(dp(12),dp(8),dp(12),dp(8));browserLayout.addView(browserStatus,new LinearLayout.LayoutParams(-1,-2));
        siteWeb=new WebView(this);configure(siteWeb,true);
        CookieManager.getInstance().setAcceptCookie(true);CookieManager.getInstance().setAcceptThirdPartyCookies(siteWeb,false);
        // There is deliberately no addJavascriptInterface on siteWeb.
        siteWeb.setWebViewClient(new WebViewClient(){
            @Override public WebResourceResponse shouldInterceptRequest(WebView v,WebResourceRequest r){
                String scheme=r.getUrl().getScheme();if("appassets.androidplatform.net".equals(r.getUrl().getHost()))return asset(r.getUrl(),"demo/");
                if(!"https".equalsIgnoreCase(scheme))return new WebResourceResponse("text/plain","UTF-8",new ByteArrayInputStream(new byte[0]));return null;
            }
            @Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest r){
                if(!r.isForMainFrame())return false;String u=r.getUrl().toString();if(allowedUrl(u))return false;warnExternal(u);return true;
            }
            @Override public void onPageStarted(WebView v,String url,android.graphics.Bitmap icon){
                uploadActivationPending=false;uploadActivationId++;pendingUploadFieldSignature="";pendingUploadLabel="";
                navigationId++;scanBusy=false;portalLoading=true;lastPromptSignature="";aiMappingSignature="";lastAiSignature="";aiMappings=new JSONObject();pendingUnknown=new JSONArray();finishUpload(null);attemptedUploads.clear();
                if(!allowedUrl(url)){v.stopLoading();autoOrigin="";browserStatus.setText("Unsupported page. Assist paused.");return;}
                currentPortalUrl=url;try{if(vault.automationAllowed())autoOrigin=origin(url);else autoOrigin="";}catch(Exception e){autoOrigin="";}
                browserTitle.setText(isDemo(url)?"Local test form":Uri.parse(url).getHost());browserStatus.setText("Page khul raha hai…");
            }
            @Override public void onPageFinished(WebView v,String url){
                portalLoading=false;if(!allowedUrl(url))return;currentPortalUrl=url;browserStatus.setText("Form check ho raha hai…");handler.postDelayed(()->scanAndOffer(false),700);
            }
            @Override public void onReceivedSslError(WebView v,SslErrorHandler h,android.net.http.SslError error){h.cancel();autoOrigin="";browserStatus.setText("Secure connection failed");actionDialog("Connection blocked","Website ka security certificate valid nahi hai.");}
            @Override public void onReceivedError(WebView v,WebResourceRequest req,WebResourceError err){if(req.isForMainFrame()){portalLoading=false;browserStatus.setText("Page load nahi hua. Internet aur URL check karein.");}}
            @Override public void onReceivedHttpError(WebView v,WebResourceRequest req,WebResourceResponse resp){
                if(req.isForMainFrame()&&(resp.getStatusCode()==403||resp.getStatusCode()==451)){autoOrigin="";browserStatus.setText("Portal ne embedded browser block kiya.");warnExternal(req.getUrl().toString());}
            }
        });
        siteWeb.setWebChromeClient(new WebChromeClient(){
            @Override public void onProgressChanged(WebView v,int progress){browserProgress.setProgress(progress);browserProgress.setVisibility(progress<100?View.VISIBLE:View.GONE);}
            @Override public boolean onShowFileChooser(WebView v,ValueCallback<Uri[]> callback,FileChooserParams params){
                if(!pendingUploadFieldSignature.isEmpty())attemptedUploads.add(pendingUploadFieldSignature);
                uploadActivationPending=false;uploadActivationId++;pendingUploadFieldSignature="";
                if(portalFileCallback!=null)portalFileCallback.onReceiveValue(null);portalFileCallback=callback;uploadParams=params;
                offerPortalDocuments();return true;
            }
            @Override public boolean onJsAlert(WebView v,String u,String msg,JsResult r){showJsDialog(msg,r,false);return true;}
            @Override public boolean onJsConfirm(WebView v,String u,String msg,JsResult r){showJsDialog(msg,r,true);return true;}
        });
        siteWeb.setDownloadListener((url,agent,disposition,mime,size)->warnExternal(url));
        browserLayout.addView(siteWeb,new LinearLayout.LayoutParams(-1,0,1));
    }
    private WebChromeClient dialogChrome(){return new WebChromeClient(){
        @Override public boolean onJsAlert(WebView v,String u,String msg,JsResult r){showJsDialog(msg,r,false);return true;}
        @Override public boolean onJsConfirm(WebView v,String u,String msg,JsResult r){showJsDialog(msg,r,true);return true;}
    };}
    private void showJsDialog(String msg,JsResult result,boolean confirm){
        AlertDialog.Builder d=new AlertDialog.Builder(this).setMessage(msg).setPositiveButton("OK",(v,w)->result.confirm()).setOnCancelListener(v->result.cancel());
        if(confirm)d.setNegativeButton("Cancel",(v,w)->result.cancel());d.show();
    }
    private static boolean isDemo(String url){return url!=null&&(url.equals(ASSETS+"demo/login.html")||url.equals(ASSETS+"demo/form.html")||url.equals(ASSETS+"demo/step2.html")||url.equals(ASSETS+"demo/advanced.html"));}
    private static boolean allowedUrl(String url){
        if(isDemo(url))return true;
        try{Uri u=Uri.parse(url);String host=u.getHost();if(!"https".equalsIgnoreCase(u.getScheme())||host==null||u.getUserInfo()!=null||(u.getPort()!=-1&&u.getPort()!=443))return false;
            String h=java.net.IDN.toASCII(host).toLowerCase(Locale.ROOT);return h.endsWith(".gov.in")||h.endsWith(".nic.in")||Arrays.asList("proteantech.in","utiitsl.com","ibps.in","nta.ac.in").stream().anyMatch(d->h.equals(d)||h.endsWith("."+d));
        }catch(Exception e){return false;}
    }
    private static String origin(String url){try{Uri u=Uri.parse(url);return u.getScheme()+"://"+u.getHost();}catch(Exception e){return "";}}
    private void warnExternal(String url){
        if(destroyed||url.startsWith("about:"))return;
        new AlertDialog.Builder(this).setTitle("Open in regular browser?").setMessage("Is page par in-app Assist available nahi hai. External browser mein aap form manually continue kar sakte hain.")
            .setPositiveButton("Open browser",(d,w)->{try{Uri u=Uri.parse(url);if("https".equalsIgnoreCase(u.getScheme())&&u.getUserInfo()==null)startActivity(new Intent(Intent.ACTION_VIEW,u));}catch(Exception ignored){}}).setNegativeButton("Stay",null).show();
    }
    private void showBrowser(String url){
        if(!allowedUrl(url)){warnExternal(url);return;}
        try{cachedProfile=vault.getProfile();cachedMeta=vault.profileMeta();}catch(Exception e){actionDialog("Profile unavailable","Saved profile read nahi hua. Profile dobara review karein.");return;}
        try{formAiConsent=vault.automationAllowed();autoOrigin=formAiConsent?origin(url):"";}catch(Exception e){formAiConsent=false;}lastPromptSignature="";nextFormAiConsent=false;aiMappings=new JSONObject();aiMappingSignature="";lastAiSignature="";browserShown=true;browserLayout.setVisibility(View.VISIBLE);appWeb.setVisibility(View.GONE);siteWeb.loadUrl(url);
    }
    private void showChat(){browserShown=false;autoOrigin="";browserLayout.setVisibility(View.GONE);appWeb.setVisibility(View.VISIBLE);appWeb.evaluateJavascript("window.avsargoOnReturn&&window.avsargoOnReturn()",null);}
    private JSONObject parseJs(String raw)throws Exception{Object obj=new JSONTokener(raw).nextValue();return obj instanceof String?new JSONObject((String)obj):(JSONObject)obj;}
    private void scanAndOffer(boolean manual){
        if(!browserShown||!active||portalLoading||helperJs.isEmpty()||dialogVisible||scanBusy||!allowedUrl(siteWeb.getUrl()))return;
        scanBusy=true;final int nav=navigationId,generation=dataGeneration;final String url=siteWeb.getUrl();
        siteWeb.evaluateJavascript("("+helperJs+")(\"scan\",null)",raw->{
            if(destroyed||nav!=navigationId||generation!=dataGeneration||!url.equals(siteWeb.getUrl()))return;scanBusy=false;if(!browserShown)return;
            try{
                JSONObject scan=parseJs(raw);if(!scan.optBoolean("ok"))return;
                JSONArray candidates=scan.optJSONArray("candidates"),unknown=new JSONArray();
                if(candidates!=null)for(int i=0;i<candidates.length();i++){JSONObject f=candidates.getJSONObject(i);if(f.optString("key").isEmpty())unknown.put(f);}
                String sig=scan.optString("signature");
                if(formAiConsent&&unknown.length()>0&&!sig.equals(lastAiSignature)){
                    lastAiSignature=sig;scanBusy=true;browserStatus.setText("AI form labels ko profile se match kar raha hai…");final JSONArray descriptors=unknown;
                    io.execute(()->{JSONObject mapped=null;try{mapped=backend.mapForm(descriptors,cachedMeta);}catch(Exception ignored){}final JSONObject response=mapped;
                        handler.post(()->{if(destroyed||nav!=navigationId||generation!=dataGeneration||!url.equals(siteWeb.getUrl()))return;scanBusy=false;if(!browserShown){lastAiSignature="";return;}aiMappings=new JSONObject();aiMappingSignature=sig;
                            try{JSONArray maps=response==null?null:response.optJSONArray("mappings");if(maps!=null)for(int i=0;i<maps.length();i++){JSONObject m=maps.getJSONObject(i);if(ProfileRules.allowed(m.optString("key")))aiMappings.put(m.getString("fieldId"),m.getString("key"));}}catch(Exception ignored){}
                            offerScan(scan,manual,nav,url);});});return;
                }
                offerScan(scan,manual,nav,url);
            }catch(Exception e){if(manual)actionDialog("Form check unavailable","Is page ka form read nahi hua. Details manually enter karke continue karein.");}
        });
    }
    private void offerScan(JSONObject scan,boolean manual,int nav,String url){
        try{
            String sig=scan.optString("signature");JSONObject flags=scan.optJSONObject("flags"),eligible=new JSONObject();ArrayList<String> missing=new ArrayList<>();JSONArray candidates=scan.optJSONArray("candidates");pendingUnknown=new JSONArray();
            if(candidates!=null)for(int i=0;i<candidates.length();i++){
                JSONObject f=candidates.getJSONObject(i);String key=f.optString("key");if(key.isEmpty()&&sig.equals(aiMappingSignature))key=aiMappings.optString(f.optString("fieldId"));
                if(!ProfileRules.allowed(key)){if(f.optBoolean("required"))pendingUnknown.put(f);continue;}
                String value=profileValue(key);if(value.isEmpty()){if(!missing.contains(key))missing.add(key);}else eligible.put(key,value);
            }
            String hint=flags!=null&&flags.optBoolean("login")?"Login complete karein; Assist uske baad chalega.":flags!=null&&flags.optBoolean("payment")?"Payment aapke control mein hai.":eligible.length()>0?eligible.length()+" reviewed details ready":missing.size()>0?missing.size()+" details chahiye":"Form check complete. Assist active hai.";
            if(flags!=null&&flags.optBoolean("files")){hint+=" • Saved documents matched to upload fields.";autoUpload(scan,nav,url);}
            if(pendingUnknown.length()>0)hint+=" • "+pendingUnknown.length()+" missing form details popup mein poochhenge.";
            if(flags!=null&&(flags.optBoolean("captcha")||flags.optBoolean("otp")))hint+=" • OTP / CAPTCHA khud complete karein.";
            if(flags!=null&&flags.optBoolean("crossOriginFrame"))hint+=" • Embedded fields manually check karein.";
            browserStatus.setText(hint);if(!manual&&sig.equals(lastPromptSignature))return;lastPromptSignature=sig;
            if(flags!=null&&(flags.optBoolean("login")||flags.optBoolean("payment"))){if(manual)actionDialog("Aapki zarurat",hint);return;}
            if(eligible.length()>0){
                if(formAiConsent){fill(eligible,sig,nav,url,missing);return;}
                browserStatus.setText("Autofill paused. Allow automation once in Preferences to continue.");return;
            }
            if(!formAiConsent)return;
            if(!missing.isEmpty()){askMissing(missing,nav,url);return;}
            if(pendingUnknown.length()>0){askUnknown(pendingUnknown,sig,nav,url);return;}
            if(manual)actionDialog("Assist",hint);
        }catch(Exception e){browserStatus.setText("Form check unavailable. Assist dobara press karein.");}
    }
    private void askUnknown(JSONArray fields,String signature,int nav,String url){
        if(dialogVisible||!browserShown||nav!=navigationId||!url.equals(siteWeb.getUrl())||fields.length()==0)return;
        LinearLayout box=new LinearLayout(this);box.setOrientation(LinearLayout.VERTICAL);box.setPadding(dp(20),0,dp(20),0);Map<String,View> inputs=new LinkedHashMap<>();
        try{for(int i=0;i<Math.min(fields.length(),12);i++){
            JSONObject f=fields.getJSONObject(i);TextView label=new TextView(this);label.setText(f.optString("label"));box.addView(label);
            if("select".equals(f.optString("type"))){Spinner input=new Spinner(this);JSONArray options=f.optJSONArray("options");ArrayList<String> names=new ArrayList<>();names.add("Choose…");if(options!=null)for(int j=0;j<options.length();j++)names.add(options.getString(j));input.setAdapter(new ArrayAdapter<>(this,android.R.layout.simple_spinner_dropdown_item,names));box.addView(input);inputs.put(f.getString("fieldId"),input);}
            else{EditText input=new EditText(this);input.setSingleLine(!"textarea".equals(f.optString("type")));input.setHint("Is application ke liye sahi detail");box.addView(input);inputs.put(f.getString("fieldId"),input);}
        }}catch(Exception e){return;}
        ScrollView scroll=new ScrollView(this);scroll.addView(box);dialogVisible=true;
        AlertDialog d=new AlertDialog.Builder(this).setTitle("Missing form details").setMessage("Ye details documents/profile mein match nahi hui. Jo sahi detail hai woh daalein; sirf isi page par use hogi.").setView(scroll).setPositiveButton("Review & fill",null).setNegativeButton("Portal par bharunga",null).create();
        d.setOnDismissListener(v->dialogVisible=false);d.setOnShowListener(v->d.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(button->{
            if(nav!=navigationId||!url.equals(siteWeb.getUrl())){d.dismiss();return;}
            JSONObject custom=new JSONObject();try{for(Map.Entry<String,View> e:inputs.entrySet()){String value=e.getValue() instanceof Spinner?((Spinner)e.getValue()).getSelectedItemPosition()>0?((Spinner)e.getValue()).getSelectedItem().toString():"":((EditText)e.getValue()).getText().toString().trim();if(!value.isEmpty())custom.put(e.getKey(),value);}
                if(custom.length()==0){Toast.makeText(this,"Ek detail enter karein",Toast.LENGTH_SHORT).show();return;}
                JSONObject payload=new JSONObject().put("fields",new JSONObject()).put("custom",custom).put("signature",signature);d.dismiss();
                siteWeb.evaluateJavascript("("+helperJs+")(\"fill\","+payload+")",raw->{if(nav!=navigationId||!url.equals(siteWeb.getUrl()))return;try{JSONObject r=parseJs(raw);JSONArray filled=r.optJSONArray("filled");int count=filled==null?0:filled.length();browserStatus.setText(r.optBoolean("ok")?count+" extra details filled. Portal par check karein.":"Page badla hai. Assist dobara press karein.");if(r.optBoolean("ok")&&count>0)recordFilled(count);lastPromptSignature=signature;}catch(Exception ignored){}});
            }catch(Exception e){Toast.makeText(this,"Details check karein",Toast.LENGTH_SHORT).show();}
        }));d.show();
    }
    private void offerUploadFields(){
        if(!browserShown||portalLoading||dialogVisible||!allowedUrl(siteWeb.getUrl()))return;final int nav=navigationId;final String url=siteWeb.getUrl();
        siteWeb.evaluateJavascript("("+helperJs+")(\"scan\",null)",raw->{if(nav!=navigationId||!url.equals(siteWeb.getUrl()))return;try{
            JSONObject scan=parseJs(raw);JSONArray uploads=scan.optJSONArray("uploads");if(uploads==null||uploads.length()==0){actionDialog("Document upload","Is page par upload field nahi mila. Form ka document step kholen.");return;}
            String[] names=new String[uploads.length()];for(int i=0;i<names.length;i++)names[i]=uploads.getJSONObject(i).optString("label","Document "+(i+1));
            new AlertDialog.Builder(this).setTitle("Kaunsa document field?").setItems(names,(d,w)->{try{if(nav!=navigationId||!url.equals(siteWeb.getUrl()))return;JSONObject payload=new JSONObject().put("signature",scan.getString("signature")).put("fieldId",uploads.getJSONObject(w).getString("fieldId"));pendingUploadLabel=uploads.getJSONObject(w).optString("label");activateUpload(payload,nav,url);}catch(Exception ignored){}}).setNegativeButton("Cancel",null).show();
        }catch(Exception e){actionDialog("Document upload","Portal ke upload button se saved document choose karein.");}});
    }
    private String humanFields(JSONObject values){StringBuilder text=new StringBuilder();for(String key:ProfileRules.KEYS)if(values.has(key))text.append("• ").append(ProfileRules.label(key)).append(": ").append(values.optString(key)).append('\n');return text.toString();}
    private void fill(JSONObject values,String signature,int nav,String url,List<String> missing){
        if(nav!=navigationId||!url.equals(siteWeb.getUrl())||!browserShown||!formAiConsent)return;
        JSONObject payload=new JSONObject();try{payload.put("fields",values).put("meta",cachedMeta).put("signature",signature);if(signature.equals(aiMappingSignature))payload.put("mappings",aiMappings);}catch(Exception e){return;}
        siteWeb.evaluateJavascript("("+helperJs+")(\"fill\","+payload.toString()+")",raw->{
            if(destroyed||nav!=navigationId||!url.equals(siteWeb.getUrl()))return;
            try{JSONObject result=parseJs(raw);if(!result.optBoolean("ok")){browserStatus.setText("Page badla hai. Assist se dobara check karein.");lastPromptSignature="";return;}
                JSONArray filled=result.optJSONArray("filled"),skipped=result.optJSONArray("skipped");int n=filled==null?0:filled.length();
                browserStatus.setText(n+" details filled. Review karke Next aap khud press karein."+(skipped!=null&&skipped.length()>0?" Kuch dropdown/format details manually enter karein.":""));
                if(n>0)recordFilled(n);
                if(!missing.isEmpty())handler.postDelayed(()->askMissing(missing,nav,url),400);
                else if(pendingUnknown.length()>0){JSONArray extra=pendingUnknown;handler.postDelayed(()->{if(nav!=navigationId||!url.equals(siteWeb.getUrl()))return;siteWeb.evaluateJavascript("("+helperJs+")(\"scan\",null)",next->{try{JSONObject fresh=parseJs(next);askUnknown(extra,fresh.getString("signature"),nav,url);}catch(Exception ignored){}});},450);}
            }catch(Exception e){browserStatus.setText("Fill result read nahi hua. Portal par details check karein.");}
        });
    }
    private void askMissing(List<String> fields,int nav,String url){
        if(dialogVisible||!browserShown||nav!=navigationId||!url.equals(siteWeb.getUrl())||fields.isEmpty())return;
        LinearLayout box=new LinearLayout(this);box.setOrientation(LinearLayout.VERTICAL);box.setPadding(dp(20),0,dp(20),0);Map<String,EditText> inputs=new LinkedHashMap<>();
        for(String key:new LinkedHashSet<String>(fields.stream().map(k->k.startsWith("dob")?"dob":k).collect(java.util.stream.Collectors.toList()))){if(!ProfileRules.allowed(key))continue;TextView label=new TextView(this);label.setText(profileLabel(key));box.addView(label);EditText input=new EditText(this);input.setSingleLine(!"address".equals(key));input.setHint("dob".equals(key)?"DD/MM/YYYY":"Enter detail");box.addView(input);inputs.put(key,input);}
        CheckBox save=new CheckBox(this);save.setText("Verified profile mein ye reviewed details save karein");box.addView(save);ScrollView scroll=new ScrollView(this);scroll.addView(box);
        dialogVisible=true;AlertDialog d=new AlertDialog.Builder(this).setTitle("Ye details aapse chahiye").setMessage("Document ke mutabik sahi details daalein. Isi website session mein use hongi.").setView(scroll).setPositiveButton("Continue",null).setNegativeButton("Portal par bharunga",(v,w)->{}).create();
        d.setOnDismissListener(v->dialogVisible=false);d.setOnShowListener(v->d.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(button->{
            try{
                if(nav!=navigationId||!url.equals(siteWeb.getUrl())){d.dismiss();return;}
                Map<String,String> map=new LinkedHashMap<>();for(Map.Entry<String,EditText> entry:inputs.entrySet())map.put(entry.getKey(),entry.getValue().getText().toString());
                Map<String,String> validated=ProfileRules.validate(map,extraLabels(cachedMeta));if(validated.isEmpty()){Toast.makeText(this,"Ek detail enter karein",Toast.LENGTH_SHORT).show();return;}
                JSONObject updated=new JSONObject(cachedProfile.toString());for(Map.Entry<String,String> entry:validated.entrySet())updated.put(entry.getKey(),entry.getValue());
                cachedProfile=updated;
                if(save.isChecked()){final int gen=dataGeneration;io.execute(()->{try{if(gen==dataGeneration){JSONObject stored=vault.getProfile();for(Map.Entry<String,String> e:validated.entrySet())stored.put(e.getKey(),e.getValue());vault.saveProfile(stored);sendToUi("profileUpdated",result(true,"Profile updated"));}}catch(Exception e){sendToUi("profileUpdated",result(false,"Profile save failed"));}});}
                d.dismiss();lastPromptSignature="";scanAndOffer(false);
            }catch(Exception e){Toast.makeText(this,e.getMessage(),Toast.LENGTH_LONG).show();}
        }));d.show();
    }
    private void recordFilled(int count){
        final int gen=dataGeneration;io.execute(()->{try{if(gen!=dataGeneration)return;JSONObject app=vault.application();app.put("filledCount",app.optInt("filledCount")+count);vault.saveApplication(app);sendToUi("formFilled",result(true,count+" details filled; review the portal."));}catch(Exception ignored){}});
    }
    private void saveScanAndEmit(String id,JSONObject scan,int generation){saveScanAndEmit(id,scan,generation,null);}
    private void saveScanAndEmit(String id,JSONObject scan,int generation,Runnable done){
        io.execute(()->{try{if(generation!=dataGeneration)return;vault.saveScan(id,scan);JSONObject state=vault.application();JSONArray proposals=new JSONArray(),docs=vault.documents();for(int i=0;i<docs.length();i++){String source=docs.getJSONObject(i).getString("id");JSONObject f=vault.scan(source).optJSONObject("fields");if(f==null)continue;for(String key:ProfileRules.KEYS)if(!f.optString(key).isEmpty())proposals.put(new JSONObject().put("key",key).put("value",f.getString(key)).put("documentId",source).put("confidence","low").put("evidence","On-device scan — original document check karein"));}JSONArray existing=state.optJSONArray("candidates");if(existing!=null)for(int i=0;i<existing.length();i++){JSONObject c=existing.getJSONObject(i);if(!id.equals(c.optString("documentId")))proposals.put(c);}state.put("status","scanned").put("candidates",proposals);vault.saveApplication(state);
            JSONObject event=new JSONObject().put("fields",scan.optJSONObject("fields")).put("documentId",id).put("pages",scan.optInt("pages")).put("totalPages",scan.optInt("totalPages")).put("truncated",scan.optBoolean("truncated"));sendToUi("ocrResult",event);
        }catch(Exception e){if(generation==dataGeneration)sendToUi("ocrError",result(false,"Scan could not be saved. Rescan the document."));}finally{if(done!=null&&generation==dataGeneration)done.run();}});
    }
    private void actionDialog(String title,String message){if(dialogVisible||destroyed)return;dialogVisible=true;AlertDialog d=new AlertDialog.Builder(this).setTitle(title).setMessage(message).setPositiveButton("Theek hai",null).create();d.setOnDismissListener(v->dialogVisible=false);d.show();}
    private void sendToUi(String name,JSONObject data){handler.post(()->{if(destroyed)return;String script="window.AvsarGoEvent&&window.AvsarGoEvent("+JSONObject.quote(name)+","+data.toString()+")";if(appReady)appWeb.evaluateJavascript(script,null);else if(events.size()<40)events.add(script);});}
    private JSONObject result(boolean ok,String message){JSONObject j=new JSONObject();try{j.put("ok",ok).put("message",message==null?"Action unavailable":message);}catch(Exception ignored){}return j;}
    private String displayName(Uri uri){try(Cursor c=getContentResolver().query(uri,new String[]{OpenableColumns.DISPLAY_NAME},null,null,null)){if(c!=null&&c.moveToFirst())return c.getString(0);}catch(Exception ignored){}return "document";}
    private void importDocuments(List<Uri> uris,int index,int generation){
        if(destroyed)return;
        if(index>=uris.size()||generation!=dataGeneration){sendToUi("importDone",result(true,"Upload complete"));return;}
        Uri uri=uris.get(index);io.execute(()->{
            try{
                if(generation!=dataGeneration)return;String mime=getContentResolver().getType(uri);String name=displayName(uri);
                if(mime==null||"application/octet-stream".equals(mime)){String n=name.toLowerCase(Locale.ROOT);mime=n.endsWith(".pdf")?"application/pdf":n.endsWith(".png")?"image/png":n.endsWith(".jpg")||n.endsWith(".jpeg")?"image/jpeg":"";}
                byte[] bytes;try(InputStream in=getContentResolver().openInputStream(uri)){if(in==null)throw new IOException("File read nahi hua");bytes=SecureVault.readLimited(in,8*1024*1024);}
                if(generation!=dataGeneration)return;JSONObject item=vault.addDocument(name,mime,bytes);sendToUi("documentAdded",new JSONObject().put("item",item));
                new DocumentOcr(this).recognize(bytes,mime,new DocumentOcr.Listener(){
                    public void result(JSONObject scan){if(generation!=dataGeneration)return;saveScanAndEmit(item.optString("id"),scan,generation,()->importDocuments(uris,index+1,generation));}
                    public void progress(int done,int total){try{sendToUi("scanProgress",new JSONObject().put("name",item.optString("name")).put("done",done).put("total",total));}catch(Exception ignored){}}
                    public void error(String message){if(generation!=dataGeneration)return;sendToUi("ocrError",MainActivity.this.result(false,message));importDocuments(uris,index+1,generation);}
                });
            }catch(Exception e){if(generation==dataGeneration){sendToUi("documentError",result(false,e.getMessage()));importDocuments(uris,index+1,generation);}}
        });
    }
    private boolean accepts(String mime){String[] types=uploadParams==null?null:uploadParams.getAcceptTypes();if(types==null||types.length==0)return true;
        for(String group:types)for(String type:group.split(",")){type=type.trim().toLowerCase(Locale.ROOT);if(type.isEmpty()||type.equals("*/*")||type.equals(mime)||(type.equals("image/*")&&mime.startsWith("image/"))||(type.equals(".pdf")&&mime.equals("application/pdf"))||((type.equals(".jpg")||type.equals(".jpeg"))&&mime.equals("image/jpeg"))||(type.equals(".png")&&mime.equals("image/png")))return true;}return false;}
    private void finishUpload(Uri[] uris){if(portalFileCallback!=null){portalFileCallback.onReceiveValue(uris);portalFileCallback=null;uploadParams=null;}}
    private void offerPortalDocuments(){
        try{JSONArray docs=vault.documents();ArrayList<JSONObject> valid=new ArrayList<>(),matched=new ArrayList<>();String kind=documentKind(pendingUploadLabel);for(int i=0;i<docs.length();i++){JSONObject d=docs.getJSONObject(i);if(accepts(d.getString("mime"))){valid.add(d);if(!kind.isEmpty()&&kind.equals(d.optString("type")))matched.add(d);}}
            if(vault.automationAllowed()&&matched.size()==1){finishUpload(new Uri[]{documentUri(matched.get(0))});browserStatus.setText("Saved "+kind+" attached. Check it on the portal.");pendingUploadLabel="";return;}
            ArrayList<String> names=new ArrayList<>();names.add("Choose a new file from phone");for(JSONObject d:valid)names.add(d.optString("name"));final String url=siteWeb.getUrl();
            new AlertDialog.Builder(this).setTitle(pendingUploadLabel.isEmpty()?"Choose the correct document":pendingUploadLabel).setItems(names.toArray(new String[0]),(dialog,which)->{if(which==0){launchPortalPicker();return;}if(!url.equals(siteWeb.getUrl())){finishUpload(null);return;}try{finishUpload(new Uri[]{documentUri(valid.get(which-1))});}catch(Exception e){finishUpload(null);}}).setNegativeButton("Cancel",(d,w)->finishUpload(null)).setOnCancelListener(d->finishUpload(null)).show();
        }catch(Exception e){launchPortalPicker();}
    }
    private Uri documentUri(JSONObject doc){return Uri.parse("content://"+getPackageName()+".documents/"+doc.optString("id"));}
    private String documentKind(String label){String d=label.toLowerCase(Locale.ROOT);if(d.matches(".*(aadhaar|aadhar|आधार).*"))return "aadhaar";if(d.matches(".*(pan card|pan document|पैन).*"))return "pan";if(d.matches(".*(signature|हस्ताक्षर).*"))return "signature";if(d.matches(".*(photo|photograph|फोटो).*"))return "photo";if(d.matches(".*(marksheet|mark sheet|अंक).*"))return "marksheet";if(d.matches(".*(bank|passbook|खाता).*"))return "bank";if(d.matches(".*(passport).*"))return "passport";if(d.matches(".*(caste|जाति).*"))return "caste";if(d.matches(".*(income|आय).*"))return "income";if(d.matches(".*(domicile|निवास).*"))return "domicile";return "";}
    private void autoUpload(JSONObject scan,int nav,String url){try{if(!formAiConsent||portalFileCallback!=null||uploadActivationPending)return;JSONArray uploads=scan.optJSONArray("uploads");if(uploads==null)return;JSONArray docs=vault.documents();for(int i=0;i<uploads.length();i++){JSONObject field=uploads.getJSONObject(i);String kind=documentKind(field.optString("label")),sig=nav+":"+field.optString("fieldId");if(kind.isEmpty()||attemptedUploads.contains(sig))continue;int n=0;for(int j=0;j<docs.length();j++)if(kind.equals(docs.getJSONObject(j).optString("type")))n++;if(n!=1)continue;pendingUploadLabel=field.optString("label");JSONObject payload=new JSONObject().put("signature",scan.optString("signature")).put("fieldId",field.optString("fieldId"));activateUpload(payload,nav,url);return;}}catch(Exception ignored){}}
    private void activateUpload(JSONObject payload,int nav,String url){
        if(!active||!browserShown||!formAiConsent||nav!=navigationId||!url.equals(siteWeb.getUrl())||uploadActivationPending)return;
        uploadActivationPending=true;pendingUploadFieldSignature=nav+":"+payload.optString("fieldId");long token=++uploadActivationId;
        prepareFileActivation(payload,nav,url,token,0);
    }
    private boolean uploadContext(int nav,String url,long token){return active&&browserShown&&formAiConsent&&token==uploadActivationId&&nav==navigationId&&url.equals(siteWeb.getUrl());}
    private void pauseFileActivation(long token){if(token!=uploadActivationId)return;uploadActivationPending=false;uploadActivationId++;pendingUploadFieldSignature="";pendingUploadLabel="";}
    private void retryFileActivation(JSONObject payload,int nav,String url,long token,int attempt){
        if(!uploadContext(nav,url,token))return;
        if(attempt>=2){attemptedUploads.add(pendingUploadFieldSignature);uploadActivationPending=false;pendingUploadFieldSignature="";browserStatus.setText("Tap the portal's document upload field to continue.");return;}
        handler.postDelayed(()->prepareFileActivation(payload,nav,url,token,attempt+1),300);
    }
    private void prepareFileActivation(JSONObject payload,int nav,String url,long token,int attempt){
        if(!uploadContext(nav,url,token))return;
        if(!siteWeb.hasWindowFocus()){pauseFileActivation(token);return;}
        siteWeb.requestFocus();
        siteWeb.evaluateJavascript("("+helperJs+")(\"scan\",null)",raw->{try{
            if(!uploadContext(nav,url,token))return;payload.put("signature",parseJs(raw).optString("signature")).put("measureOnly",false);
            siteWeb.evaluateJavascript("("+helperJs+")(\"uploadFocus\","+payload+")",focused->{try{
                if(!uploadContext(nav,url,token))return;if(!siteWeb.hasWindowFocus()){pauseFileActivation(token);return;}
                JSONObject r=parseJs(focused);if(!r.optBoolean("ok")||!r.optBoolean("safeTarget")||!r.optBoolean("focusedFile")){retryFileActivation(payload,nav,url,token,attempt);return;}
                // Activate the verified file input itself. Space never implicitly submits
                // a form, and avoids WebView scroll/viewport coordinate races.
                long time=android.os.SystemClock.uptimeMillis();
                android.view.KeyEvent down=new android.view.KeyEvent(time,time,android.view.KeyEvent.ACTION_DOWN,android.view.KeyEvent.KEYCODE_SPACE,0),up=new android.view.KeyEvent(time,android.os.SystemClock.uptimeMillis(),android.view.KeyEvent.ACTION_UP,android.view.KeyEvent.KEYCODE_SPACE,0);
                down.setSource(android.view.InputDevice.SOURCE_KEYBOARD);up.setSource(android.view.InputDevice.SOURCE_KEYBOARD);siteWeb.dispatchKeyEvent(down);siteWeb.dispatchKeyEvent(up);
                handler.postDelayed(()->retryFileActivation(payload,nav,url,token,attempt),450);
            }catch(Exception e){retryFileActivation(payload,nav,url,token,attempt);}});
        }catch(Exception e){retryFileActivation(payload,nav,url,token,attempt);}});
    }
    private Map<String,String> extraLabels(JSONObject meta){Map<String,String> out=new LinkedHashMap<>();for(Iterator<String> it=meta.keys();it.hasNext();){String k=it.next();JSONObject m=meta.optJSONObject(k);if(m!=null)out.put(k,m.optString("label"));}return out;}
    private String profileLabel(String key){JSONObject m=cachedMeta.optJSONObject(key);return m!=null?m.optString("label",ProfileRules.label(key)):ProfileRules.label(key);}
    private String profileValue(String key){Map<String,String> m=new LinkedHashMap<>();for(Iterator<String> it=cachedProfile.keys();it.hasNext();){String k=it.next();m.put(k,cachedProfile.optString(k));}return ProfileRules.valueFor(m,key);}

    private void launchPortalPicker(){try{Intent intent=uploadParams.createIntent();intent.addCategory(Intent.CATEGORY_OPENABLE);startActivityForResult(intent,PICK_PORTAL_UPLOAD);}catch(Exception e){finishUpload(null);Toast.makeText(this,"Document picker unavailable",Toast.LENGTH_SHORT).show();}}
    @Override protected void onActivityResult(int request,int response,Intent intent){super.onActivityResult(request,response,intent);
        if(request==PICK_DOCUMENT){ArrayList<Uri> uris=new ArrayList<>();if(response==RESULT_OK&&intent!=null){if(intent.getClipData()!=null)for(int i=0;i<Math.min(15,intent.getClipData().getItemCount());i++)uris.add(intent.getClipData().getItemAt(i).getUri());else if(intent.getData()!=null)uris.add(intent.getData());}
            if(uris.isEmpty())sendToUi("importDone",result(true,"File selection cancelled"));else importDocuments(uris,0,dataGeneration);
        }else if(request==PICK_PORTAL_UPLOAD)finishUpload(WebChromeClient.FileChooserParams.parseResult(response,intent));
    }
    @Override protected void onResume(){super.onResume();active=true;handler.removeCallbacks(periodicScan);handler.postDelayed(periodicScan,1200);if(appWeb!=null)appWeb.onResume();if(siteWeb!=null)siteWeb.onResume();if(appReady&&System.currentTimeMillis()-lastConfigRefresh>30000)new PrivateBridge().fetchConfig();}
    @Override protected void onPause(){active=false;uploadActivationPending=false;uploadActivationId++;pendingUploadFieldSignature="";handler.removeCallbacks(periodicScan);if(appWeb!=null)appWeb.onPause();if(siteWeb!=null)siteWeb.onPause();CookieManager.getInstance().flush();super.onPause();}
    @Override protected void onDestroy(){destroyed=true;active=false;handler.removeCallbacksAndMessages(null);finishUpload(null);io.shutdownNow();if(siteWeb!=null)siteWeb.destroy();if(appWeb!=null){appWeb.removeJavascriptInterface("AvsarGoNative");appWeb.destroy();}super.onDestroy();}
    @Override public void onBackPressed(){if(browserShown){if(siteWeb.canGoBack())siteWeb.goBack();else showChat();return;}
        appWeb.evaluateJavascript("window.avsargoHandleBack?window.avsargoHandleBack():false",value->{if(!"true".equals(value))finish();});}

    public final class PrivateBridge {
        @JavascriptInterface public String state(){try{
            boolean allowed=vault.automationAllowed();JSONObject settings=vault.aiSettings();settings.put("automationConsent",allowed);settings.put("hasKey",false);JSONObject remote=vault.backendState();JSONArray docs=vault.documents();for(int i=0;i<docs.length();i++){JSONObject d=docs.getJSONObject(i);try{JSONObject scan=vault.scan(d.getString("id"));d.put("scanned",!scan.optString("text").isEmpty()).put("pages",scan.optInt("pages")).put("totalPages",scan.optInt("totalPages")).put("truncated",scan.optBoolean("truncated"));}catch(Exception ignored){}}
            return new JSONObject().put("profile",vault.getProfile()).put("profileMeta",vault.profileMeta()).put("documents",docs).put("application",vault.application()).put("ai",settings).put("workspace",vault.workspace()).put("server",remote.optJSONObject("config")==null?new JSONObject():remote.optJSONObject("config")).put("account",remote.optJSONObject("account")==null?new JSONObject():remote.optJSONObject("account")).toString();
        }catch(Exception e){return "{\"profile\":{},\"documents\":[],\"ai\":{},\"workspace\":{},\"storageError\":true}";}}
        @JavascriptInterface public void saveWorkspace(String raw){if(erasing||destroyed||raw==null||raw.length()>6000000)return;final int gen=dataGeneration;io.execute(()->{try{JSONObject incoming=new JSONObject(raw),safe=new JSONObject();JSONArray chats=incoming.optJSONArray("chats"),out=new JSONArray();if(chats==null){chats=new JSONArray().put(new JSONObject().put("id","legacy").put("title","Earlier conversation").put("messages",incoming.optJSONArray("messages")));}for(int i=Math.max(0,chats.length()-20);i<chats.length();i++){JSONObject c=chats.optJSONObject(i);if(c==null)continue;JSONArray ms=c.optJSONArray("messages"),filtered=new JSONArray();if(ms!=null)for(int j=Math.max(0,ms.length()-40);j<ms.length();j++){JSONObject m=ms.optJSONObject(j);if(m==null||!Arrays.asList("user","assistant").contains(m.optString("role")))continue;String text=m.optString("text");JSONObject item=new JSONObject().put("role",m.optString("role")).put("text",text.substring(0,Math.min(5000,text.length()))).put("cloud",m.optBoolean("cloud",true)).put("error",m.optBoolean("error"));JSONObject application=m.optJSONObject("application");if(application!=null&&allowedUrl(application.optString("url")))item.put("application",new JSONObject().put("id",application.optString("id")).put("name",application.optString("name")).put("url",application.optString("url")));JSONObject research=m.optJSONObject("research");if(research!=null&&research.toString().length()<=100000)item.put("research",research);filtered.put(item);}out.put(new JSONObject().put("id",c.optString("id")).put("title",c.optString("title").substring(0,Math.min(80,c.optString("title").length()))).put("messages",filtered).put("application",c.optJSONObject("application")));}safe.put("chats",out).put("activeId",incoming.optString("activeId")).put("messages",incoming.optJSONArray("messages")).put("application",incoming.optJSONObject("application"));if(gen==dataGeneration)vault.saveWorkspace(safe);}catch(Exception e){sendToUi("storageError",result(false,"Chat save unavailable"));}});}

        @JavascriptInterface public void pickDocument(){if(erasing||destroyed)return;runOnUiThread(()->{try{Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");i.putExtra(Intent.EXTRA_MIME_TYPES,new String[]{"application/pdf","image/jpeg","image/png"});i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE,true);startActivityForResult(i,PICK_DOCUMENT);}catch(ActivityNotFoundException e){sendToUi("documentError",result(false,"Phone document picker unavailable"));sendToUi("importDone",result(false,"Picker unavailable"));}});}
        @JavascriptInterface public void saveProfile(String raw){if(erasing||destroyed)return;final int gen=dataGeneration;io.execute(()->{try{JSONObject incoming=new JSONObject(raw),fields=incoming.optJSONObject("fields"),meta=incoming.optJSONObject("meta");if(fields==null)fields=incoming;if(meta==null)meta=vault.profileMeta();Map<String,String> values=new LinkedHashMap<>();for(Iterator<String> it=fields.keys();it.hasNext();){String k=it.next();values.put(k,fields.optString(k));}Map<String,String> labels=extraLabels(meta);JSONObject safe=new JSONObject(ProfileRules.validate(values,labels)),safeMeta=new JSONObject();for(String k:labels.keySet())if(safe.has(k)&&k.matches("extra_[a-f0-9]{16}")&&!ProfileRules.secret(labels.get(k)))safeMeta.put(k,new JSONObject().put("label",labels.get(k)).put("group","other").put("type","text"));if(safe.length()==0)throw new IllegalArgumentException("Review at least one detail");if(gen!=dataGeneration)return;vault.saveProfile(safe);vault.saveProfileMeta(safeMeta);JSONObject app=vault.application();app.put("status","reviewed").put("candidates",new JSONArray());vault.saveApplication(app);final JSONObject finalMeta=safeMeta;handler.post(()->{cachedProfile=safe;cachedMeta=finalMeta;});sendToUi("profileSaved",result(true,"Reviewed profile saved"));}catch(Exception e){sendToUi("profileSaved",result(false,e.getMessage()));}});}

        @JavascriptInterface public void removeDocument(String id){io.execute(()->{try{vault.removeDocument(id);sendToUi("documentRemoved",result(true,"Document removed"));}catch(Exception e){sendToUi("documentRemoved",result(false,"Document delete failed"));}});}
        @JavascriptInterface public void setDocumentType(String id,String type){if(erasing||destroyed||!Arrays.asList("aadhaar","pan","passport","marksheet","qualification","caste","income","domicile","bank","business","photo","signature","other").contains(type))return;io.execute(()->{try{vault.documentType(id,type);sendToUi("documentTypeUpdated",result(true,"Document type saved"));}catch(Exception e){sendToUi("documentTypeUpdated",result(false,"Document type could not be saved"));}});}
        @JavascriptInterface public void rescanDocument(String id){final int gen=dataGeneration;io.execute(()->{try{new DocumentOcr(MainActivity.this).recognize(vault.documentData(id),vault.documentMeta(id).getString("mime"),new DocumentOcr.Listener(){public void result(JSONObject scan){if(gen!=dataGeneration)return;saveScanAndEmit(id,scan,gen);}public void error(String e){if(gen==dataGeneration)sendToUi("ocrError",MainActivity.this.result(false,e));}});}catch(Exception e){sendToUi("ocrError",result(false,"Saved document scan unavailable"));}});}
        @JavascriptInterface public void analyseDocuments(String raw){if(erasing||destroyed)return;final int gen=dataGeneration;io.execute(()->{try{if(!vault.automationAllowed())throw new IOException("Allow document automation once to continue");JSONArray ids=new JSONObject(raw).getJSONArray("ids"),scans=new JSONArray(),analysed=new JSONArray();if(ids.length()<1||ids.length()>15)throw new IOException("Choose scanned documents");int chars=0,imageCount=0;Set<String> seen=new HashSet<>();for(int i=0;i<ids.length();i++){String id=ids.getString(i);if(!seen.add(id))continue;JSONObject scan=vault.scan(id);String text=scan.optString("text");JSONArray images=scan.optJSONArray("images"),selected=new JSONArray();if(images!=null)for(int j=0;j<images.length()&&imageCount<6;j++){selected.put(images.getJSONObject(j));imageCount++;}if(text.length()<8&&selected.length()==0)continue;chars+=text.length();if(chars>720000)throw new IOException("Document analysis size exceeded");scans.put(new JSONObject().put("id",id).put("text",text).put("images",selected));analysed.put(id);}if(gen!=dataGeneration)return;JSONObject response=backend.analyseDocuments(scans);if(gen!=dataGeneration)return;for(int i=0;i<analysed.length();i++)vault.documentMeta(analysed.getString(i));JSONArray types=response.optJSONArray("documentTypes");if(types!=null)for(int i=0;i<types.length();i++){JSONObject t=types.getJSONObject(i);vault.documentType(t.getString("documentId"),t.getString("type"));}JSONObject state=vault.application();state.put("status","analysed").put("candidates",response.getJSONArray("candidates")).put("analysedIds",analysed).put("meta",response.optJSONObject("meta")).put("coverage",response.optJSONArray("coverage")).put("errors",response.optJSONArray("errors"));vault.saveApplication(state);response.put("ok",true);sendToUi("documentAnalysis",response);}catch(Exception e){if(gen==dataGeneration&&!destroyed)sendToUi("documentAnalysis",result(false,e.getMessage()));}});}
        @JavascriptInterface public void savePermissions(boolean allowed){if(erasing||destroyed)return;io.execute(()->{try{JSONObject settings=vault.aiSettings();settings.put("automationConsent",allowed).put("permissionsVersion",1);if(allowed)settings.put("enabled",true);vault.saveAiSettings(settings);handler.post(()->{formAiConsent=allowed;autoOrigin=allowed?origin(siteWeb.getUrl()):"";lastPromptSignature="";});sendToUi("permissionSaved",result(true,allowed?"Automation allowed":"Automation paused"));}catch(Exception e){sendToUi("permissionSaved",result(false,"Preference could not be saved"));}});}
        @JavascriptInterface public void saveAiSettings(String raw){if(erasing||destroyed)return;io.execute(()->{try{JSONObject config=vault.aiSettings();config.put("enabled",new JSONObject(raw).optBoolean("enabled"));vault.saveAiSettings(config);sendToUi("keySaved",result(true,"Chat preference saved"));}catch(Exception e){sendToUi("keySaved",result(false,"Preference could not be saved"));}});}
        @JavascriptInterface public void resolveApplication(String raw){if(erasing||destroyed)return;final int gen=dataGeneration;io.execute(()->{try{JSONObject request=new JSONObject(raw);if(!request.has("state"))request.put("state",vault.getProfile().optString("state"));request.put("consent",vault.aiSettings().optBoolean("enabled"));JSONObject response=backend.resolveApplication(request);if(gen==dataGeneration)sendToUi("applicationResolved",response.put("ok",true));}catch(Exception e){if(gen==dataGeneration)sendToUi("applicationResolved",result(false,e.getMessage()));}});}
        @JavascriptInterface public void previewDocument(String id){if(erasing||destroyed)return;runOnUiThread(()->startActivity(new Intent(MainActivity.this,DocumentPreviewActivity.class).putExtra("documentId",id)));}
        @JavascriptInterface public void showResearch(String raw){if(raw==null||raw.length()>100000)return;try{JSONObject value=new JSONObject(raw);runOnUiThread(()->startActivity(new Intent(MainActivity.this,GroundingActivity.class).putExtra("research",value.toString())));}catch(Exception ignored){}}

        @JavascriptInterface public void requestAi(String raw){if(erasing||destroyed)return;final int gen=dataGeneration;
            io.execute(()->{JSONObject request=new JSONObject();try{request=new JSONObject(raw);if(gen!=dataGeneration)return;if(!vault.aiSettings().optBoolean("enabled"))throw new IOException("AI chat is paused. Enable it in Preferences.");JSONObject context=request.optJSONObject("workflow");if(context==null)context=new JSONObject();JSONObject app=vault.application();context.put("documentCount",vault.documents().length()).put("reviewedKeys",vault.getProfile().names()==null?new JSONArray():vault.getProfile().names()).put("documentAnalysis",app.optString("status","none")).put("filledCount",app.optInt("filledCount"));request.put("workflow",context);JSONObject response=backend.chat(request);if(gen==dataGeneration&&!destroyed)sendToUi("aiReply",response.put("ok",true).put("requestId",request.optString("requestId")));}
                catch(Exception e){if(gen==dataGeneration&&!destroyed){JSONObject reply=new JSONObject();try{reply.put("ok",false).put("text",e.getMessage()==null?"AI connection unavailable":e.getMessage()).put("requestId",request.optString("requestId"));}catch(Exception ignored){}sendToUi("aiReply",reply);}}});
        }
        @JavascriptInterface public synchronized void fetchConfig(){if(erasing||destroyed||configRefreshing)return;configRefreshing=true;final int gen=dataGeneration;
            io.execute(()->{try{if(gen!=dataGeneration)return;backend.refresh();lastConfigRefresh=System.currentTimeMillis();if(gen==dataGeneration)sendToUi("configUpdated",result(true,"App settings refreshed"));}catch(Exception e){if(gen==dataGeneration)sendToUi("configUpdated",result(false,"Connection refresh unavailable. Saved documents work offline."));}finally{configRefreshing=false;}});
        }
        @JavascriptInterface public void openSupport(){io.execute(()->{try{String url=vault.backendState().getJSONObject("config").getJSONObject("branding").getString("supportUrl");Uri u=Uri.parse(url);if("https".equals(u.getScheme())&&u.getUserInfo()==null)runOnUiThread(()->startActivity(new Intent(Intent.ACTION_VIEW,u)));}catch(Exception ignored){}});}
        @JavascriptInterface public void createPayment(){if(erasing||destroyed)return;final int gen=dataGeneration;io.execute(()->{try{String url=backend.checkout();if(!url.startsWith(BackendClient.BASE+"/checkout/")||!url.substring((BackendClient.BASE+"/checkout/").length()).matches("[a-zA-Z0-9_-]{40,100}"))throw new IOException("Checkout address invalid");if(gen!=dataGeneration)return;runOnUiThread(()->{try{startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(url)));sendToUi("paymentStatus",result(true,"Return after payment and refresh your account to check Plus."));}catch(Exception e){sendToUi("paymentStatus",result(false,"No browser available for secure checkout"));}});}catch(Exception e){if(gen==dataGeneration)sendToUi("paymentStatus",result(false,e.getMessage()));}});}
        @JavascriptInterface public void setAppearance(String mode){runOnUiThread(()->{boolean light="light".equals(mode);setTheme(light?android.R.style.Theme_Material_Light_NoActionBar:android.R.style.Theme_Material_NoActionBar);int color=light?Color.rgb(252,252,252):Color.rgb(32,33,35);getWindow().setStatusBarColor(color);getWindow().setNavigationBarColor(color);appWeb.setBackgroundColor(color);if(android.os.Build.VERSION.SDK_INT>=30&&getWindow().getInsetsController()!=null)getWindow().getInsetsController().setSystemBarsAppearance(light?android.view.WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS|android.view.WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS:0,android.view.WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS|android.view.WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS);});}
        @JavascriptInterface public void copyText(String text){if(text==null||text.length()>15000)return;runOnUiThread(()->{android.content.ClipboardManager clipboard=(android.content.ClipboardManager)getSystemService(CLIPBOARD_SERVICE);if(clipboard!=null)clipboard.setPrimaryClip(android.content.ClipData.newPlainText("AvsarGo response",text));});}
        @JavascriptInterface public void resumePortal(){runOnUiThread(()->{if(allowedUrl(siteWeb.getUrl())){browserShown=true;browserLayout.setVisibility(View.VISIBLE);appWeb.setVisibility(View.GONE);lastPromptSignature="";scanAndOffer(true);}else actionDialog("Open form","Chat mein form ka naam batayein.");});}
        @JavascriptInterface public void openDemo(){runOnUiThread(()->showBrowser(ASSETS+"demo/login.html"));}
        @JavascriptInterface public void openPortal(String url){runOnUiThread(()->showBrowser(url.trim()));}
        @JavascriptInterface public void eraseLocalData(){erasing=true;dataGeneration++;runOnUiThread(()->{autoOrigin="";cachedProfile=new JSONObject();navigationId++;finishUpload(null);siteWeb.stopLoading();siteWeb.loadUrl("about:blank");siteWeb.clearHistory();siteWeb.clearCache(true);CookieManager.getInstance().removeAllCookies(null);WebStorage.getInstance().deleteAllData();if(browserShown)showChat();});
            io.execute(()->{try{vault.eraseAll();JSONObject done=result(true,"Local documents, profile, chat, AI key aur website sessions deleted");
                handler.post(()->{if(destroyed)return;appWeb.evaluateJavascript("window.AvsarGoEvent&&window.AvsarGoEvent(\"erased\","+done.toString()+")",value->erasing=false);});}catch(Exception e){erasing=false;sendToUi("erased",result(false,"Some local data could not be deleted"));}});}
    }
}
