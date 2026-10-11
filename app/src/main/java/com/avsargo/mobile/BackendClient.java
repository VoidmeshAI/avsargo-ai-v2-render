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
        connection.setInstanceFollowRedirects(false);connection.setConnectTimeout(15000);connection.setReadTimeout(45000);connection.setRequestMethod(method);
        connection.setRequestProperty("Accept","application/json");if(authenticated)connection.setRequestProperty("Authorization","Bearer "+token);
        try{
            if(body!=null){connection.setDoOutput(true);connection.setRequestProperty("Content-Type","application/json");byte[] payload=body.toString().getBytes(StandardCharsets.UTF_8);connection.setFixedLengthStreamingMode(payload.length);try(OutputStream out=connection.getOutputStream()){out.write(payload);}}
            int status=connection.getResponseCode();InputStream stream=status>=200&&status<300?connection.getInputStream():connection.getErrorStream();
            if(stream==null)throw new IOException("Server unavailable (HTTP "+status+")");JSONObject value;try(InputStream in=stream){value=new JSONObject(new String(SecureVault.readLimited(in,256000),StandardCharsets.UTF_8));}
            if(status==401&&authenticated){vault.setDeviceToken("");throw new IOException("App session expired. Refresh Settings and try again.");}
            if(status<200||status>=300)throw new IOException(value.optString("error","Request failed (HTTP "+status+")"));return value;
        }finally{connection.disconnect();}
    }
    private String token()throws Exception{String token=vault.deviceToken();if(token.isEmpty()){JSONObject value=call("/api/device/register","POST",new JSONObject(),false);token=value.getString("token");if(!token.matches("[a-zA-Z0-9_-]{40,100}"))throw new IOException("Invalid app session");vault.setDeviceToken(token);}return token;}
    public void refresh()throws Exception{
        JSONObject saved=vault.backendState();saved.put("config",call("/api/app/config","GET",null,false));vault.saveBackendState(saved);
        try{saved.put("account",call("/api/device/status","GET",null,true));vault.saveBackendState(saved);}catch(Exception ignored){}
    }
    public String chat(JSONObject request)throws Exception{
        JSONObject reply=call("/api/chat","POST",new JSONObject().put("consent",true).put("messages",request.getJSONArray("messages")),true);
        JSONObject saved=vault.backendState();if(reply.has("status")){saved.put("account",reply.getJSONObject("status"));vault.saveBackendState(saved);}return reply.getString("text");
    }
    public String checkout()throws Exception{return call("/api/payments/order","POST",new JSONObject(),true).getString("checkoutUrl");}
}
