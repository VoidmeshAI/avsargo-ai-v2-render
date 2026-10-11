package com.avsargo.mobile;

import org.json.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import javax.net.ssl.HttpsURLConnection;

/** Provider secrets never enter the APK. An installation token is stored encrypted. */
public final class BackendClient {
    public static final String BASE="https://avsargo-ai-admin-production.up.railway.app";
    private final SecureVault vault;
    public BackendClient(SecureVault vault){this.vault=vault;}
    private JSONObject call(String path,String method,JSONObject body,boolean authenticated)throws Exception{
        String token=authenticated?token():"";
        HttpsURLConnection connection=(HttpsURLConnection)new URL(BASE+path).openConnection();
        connection.setInstanceFollowRedirects(false);connection.setConnectTimeout(15000);connection.setReadTimeout(180000);connection.setRequestMethod(method);
        connection.setRequestProperty("Accept","application/json");if(authenticated)connection.setRequestProperty("Authorization","Bearer "+token);
        try{
            if(body!=null){connection.setDoOutput(true);connection.setRequestProperty("Content-Type","application/json");byte[] payload=body.toString().getBytes(StandardCharsets.UTF_8);connection.setFixedLengthStreamingMode(payload.length);try(OutputStream out=connection.getOutputStream()){out.write(payload);}}
            int status=connection.getResponseCode();InputStream stream=status>=200&&status<300?connection.getInputStream():connection.getErrorStream();
            if(stream==null)throw new IOException("Server unavailable (HTTP "+status+")");JSONObject value;try(InputStream in=stream){value=new JSONObject(new String(SecureVault.readLimited(in,2500000),StandardCharsets.UTF_8));}
            if(status==401&&authenticated){vault.setDeviceToken("");throw new IOException("Session refreshed. Please retry.");}
            if(status<200||status>=300)throw new IOException(value.optString("error","Request failed (HTTP "+status+")"));return value;
        }finally{connection.disconnect();}
    }
    private String token()throws Exception{String token=vault.deviceToken();if(token.isEmpty()){JSONObject value=call("/api/device/register","POST",new JSONObject(),false);token=value.getString("token");if(!token.matches("[a-zA-Z0-9_-]{40,100}"))throw new IOException("Invalid app session");vault.setDeviceToken(token);}return token;}
    public void refresh()throws Exception{
        JSONObject saved=vault.backendState();saved.put("config",call("/api/app/config","GET",null,false));vault.saveBackendState(saved);
        try{saved.put("account",call("/api/device/status","GET",null,true));vault.saveBackendState(saved);}catch(Exception ignored){}
    }
    public JSONObject chat(JSONObject request)throws Exception{
        JSONObject payload=new JSONObject().put("consent",true).put("messages",request.getJSONArray("messages"));
        if(request.optJSONObject("workflow")!=null)payload.put("workflow",request.getJSONObject("workflow"));
        JSONObject reply=call("/api/chat","POST",payload,true);
        JSONObject saved=vault.backendState();if(reply.has("status")){saved.put("account",reply.getJSONObject("status"));vault.saveBackendState(saved);}return reply;
    }
    public JSONObject analyseDocuments(JSONArray scans)throws Exception {
        return applicationCall("/api/documents/analyse",new JSONObject().put("consent",true).put("documents",scans));
    }
    public JSONObject mapForm(JSONArray fields,JSONObject meta)throws Exception {
        return applicationCall("/api/forms/map",new JSONObject().put("consent",true).put("fields",fields).put("meta",meta));
    }
    public JSONObject resolveApplication(JSONObject request)throws Exception {return applicationCall("/api/applications/resolve",request);}
    private JSONObject applicationCall(String path,JSONObject body)throws Exception {
        JSONObject reply=call(path,"POST",body,true),saved=vault.backendState();
        if(reply.has("status")){saved.put("account",reply.getJSONObject("status"));vault.saveBackendState(saved);}return reply;
    }
    public String checkout()throws Exception{return call("/api/payments/order","POST",new JSONObject(),true).getString("checkoutUrl");}
}
