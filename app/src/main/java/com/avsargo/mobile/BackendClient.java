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
    private JSONObject memoryState=new JSONObject();
    private String memoryToken="";
    public BackendClient(SecureVault vault){this.vault=vault;}
    public synchronized JSONObject snapshotState(){try{JSONObject disk=vault.backendState();if(disk.length()>0&&memoryState.length()==0)memoryState=disk;}catch(Exception ignored){}try{return new JSONObject(memoryState.toString());}catch(Exception ignored){return new JSONObject();}}
    private synchronized void publishState(JSONObject state){memoryState=state;try{vault.saveBackendState(state);}catch(Exception e){android.util.Log.w("AvsarGoStorage","Account cache not persisted: "+e.getClass().getSimpleName());}}
    private JSONObject call(String path,String method,JSONObject body,boolean authenticated)throws Exception{
        String token=authenticated?token():"";
        HttpsURLConnection connection=(HttpsURLConnection)new URL(BASE+path).openConnection();
        connection.setInstanceFollowRedirects(false);connection.setConnectTimeout(15000);connection.setReadTimeout(180000);connection.setRequestMethod(method);
        connection.setRequestProperty("Accept","application/json");if(authenticated)connection.setRequestProperty("Authorization","Bearer "+token);
        try{
            if(body!=null){connection.setDoOutput(true);connection.setRequestProperty("Content-Type","application/json");byte[] payload=body.toString().getBytes(StandardCharsets.UTF_8);connection.setFixedLengthStreamingMode(payload.length);try(OutputStream out=connection.getOutputStream()){out.write(payload);}}
            int status=connection.getResponseCode();InputStream stream=status>=200&&status<300?connection.getInputStream():connection.getErrorStream();
            if(stream==null)throw new IOException("Server unavailable (HTTP "+status+")");JSONObject value;try(InputStream in=stream){value=new JSONObject(new String(SecureVault.readLimited(in,2500000),StandardCharsets.UTF_8));}
            if(status==401&&authenticated){memoryToken="";try{vault.setDeviceToken("");}catch(Exception ignored){}throw new IOException("Session refreshed. Please retry.");}
            if(status<200||status>=300)throw new IOException(value.optString("error","Request failed (HTTP "+status+")"));return value;
        }finally{connection.disconnect();}
    }
    private synchronized String token()throws Exception{String token=memoryToken;if(token.isEmpty())try{token=vault.deviceToken();}catch(Exception ignored){}if(token.isEmpty()){JSONObject value=call("/api/device/register","POST",new JSONObject(),false);token=value.getString("token");if(!token.matches("[a-zA-Z0-9_-]{40,100}"))throw new IOException("Invalid app session");memoryToken=token;try{vault.setDeviceToken(token);}catch(Exception e){android.util.Log.w("AvsarGoStorage","Session retained in memory: "+e.getClass().getSimpleName());}}memoryToken=token;return token;}
    public void refresh()throws Exception{
        JSONObject saved=snapshotState();saved.put("config",call("/api/app/config","GET",null,false));publishState(saved);
        try{saved.put("account",call("/api/device/status","GET",null,true));publishState(saved);}catch(Exception ignored){}
    }
    public JSONObject chat(JSONObject request)throws Exception{
        JSONObject payload=new JSONObject().put("consent",true).put("messages",request.getJSONArray("messages"));
        if(request.optJSONObject("workflow")!=null)payload.put("workflow",request.getJSONObject("workflow"));
        JSONObject reply=call("/api/chat","POST",payload,true);
        JSONObject saved=snapshotState();if(reply.has("status")){saved.put("account",reply.getJSONObject("status"));publishState(saved);}return reply;
    }
    public JSONObject analyseDocuments(JSONArray scans)throws Exception {
        return applicationCall("/api/documents/analyse",new JSONObject().put("consent",true).put("documents",scans));
    }
    public JSONObject mapForm(JSONArray fields,JSONObject meta)throws Exception {
        return applicationCall("/api/forms/map",new JSONObject().put("consent",true).put("fields",fields).put("meta",meta));
    }
    public JSONObject resolveApplication(JSONObject request)throws Exception {return applicationCall("/api/applications/resolve",request);}
    private JSONObject applicationCall(String path,JSONObject body)throws Exception {
        JSONObject reply=call(path,"POST",body,true),saved=snapshotState();
        if(reply.has("status")){saved.put("account",reply.getJSONObject("status"));publishState(saved);}return reply;
    }
    public String checkout()throws Exception{return call("/api/payments/order","POST",new JSONObject(),true).getString("checkoutUrl");}
}
