package com.avsargo.mobile;
import android.content.Context;
import android.util.AtomicFile;
import android.webkit.WebView;
import androidx.test.core.app.ApplicationProvider;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.rule.ActivityTestRule;
import androidx.test.uiautomator.UiDevice;
import org.junit.*;
import org.junit.runner.RunWith;
import org.json.*;
import java.io.*;
import java.lang.reflect.Field;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.Assert.*;
/** No prepared preferences or encryption key: reproduces first installation. */
@RunWith(AndroidJUnit4.class)
public final class FreshInstallWorkflowTest {
 @Rule public ActivityTestRule<MainActivity> rule=new ActivityTestRule<>(MainActivity.class,false,false);
 private Context context;private SecureVault vault;private MainActivity activity;
 @Before public void emptyInstallation()throws Exception{context=ApplicationProvider.getApplicationContext();vault=new SecureVault(context);vault.eraseAll();}
 private String js(String expression)throws Exception{Field f=MainActivity.class.getDeclaredField("appWeb");f.setAccessible(true);WebView web=(WebView)f.get(activity);AtomicReference<String> output=new AtomicReference<>();CountDownLatch latch=new CountDownLatch(1);InstrumentationRegistry.getInstrumentation().runOnMainSync(()->web.evaluateJavascript(expression,s->{output.set(s);latch.countDown();}));assertTrue(latch.await(15,TimeUnit.SECONDS));return output.get();}
 private void waitFor(String expression)throws Exception{long until=System.currentTimeMillis()+90000;while(System.currentTimeMillis()<until){if("true".equals(js(expression)))return;Thread.sleep(200);}File dir=new File(context.getExternalFilesDir(null),"verification");dir.mkdirs();UiDevice.getInstance(InstrumentationRegistry.getInstrumentation()).takeScreenshot(new File(dir,"native-fresh-failure.png"));System.out.println("Fresh UI diagnostic: "+js("JSON.stringify({width:innerWidth,height:innerHeight,body:document.body.innerText.slice(0,2000),history:document.getElementById('history').children.length})"));fail("Fresh-install timeout: "+expression);}
 @Test public void firstMessageReachesSavedProviderWithoutEnablingChat()throws Exception{
  activity=rule.launchActivity(null);waitFor("!!window.AvsarGoEvent&&document.getElementById('history').children.length>0");
  assertEquals("false",js("/Enable chat|Start chatting with AvsarGo|Chat is paused/.test(document.body.innerText)"));
  js("document.getElementById('chatInput').value='Reply with exactly AVSAR_READY';document.getElementById('send').click()");
  waitFor("document.querySelector('.message.assistant:not(.typing) .msg-body')&&document.querySelector('.message.assistant:not(.typing) .msg-body').innerText.indexOf('AVSAR_READY')>=0");
  assertEquals("true",js("document.getElementById('modal').hidden"));
  assertEquals("0",js("document.querySelectorAll('.error-box').length"));
  assertFalse("Chat does not require a saved enable flag",vault.aiSettings().has("enabled"));
  long until=System.currentTimeMillis()+5000;while(vault.workspace().toString().indexOf("AVSAR_READY")<0&&System.currentTimeMillis()<until)Thread.sleep(100);
  assertTrue("First conversation is persisted",new SecureVault(context).workspace().toString().contains("AVSAR_READY"));
  assertFalse(vault.deviceToken().isEmpty());
  AdvancedWorkflowTest.testInstallationToken=vault.deviceToken();
  File dir=new File(context.getExternalFilesDir(null),"verification");dir.mkdirs();UiDevice.getInstance(InstrumentationRegistry.getInstrumentation()).takeScreenshot(new File(dir,"native-fresh-chat.png"));
 }
 @Test public void freshLandscapeShowsSidebarAndWorkingCustomerSheets()throws Exception{
  // Only this UI test reuses a session. The first-message test still starts
  // without a token, key or permissions and exercises real registration.
  if(!AdvancedWorkflowTest.testInstallationToken.isEmpty())vault.setDeviceToken(AdvancedWorkflowTest.testInstallationToken);
  UiDevice device=UiDevice.getInstance(InstrumentationRegistry.getInstrumentation());device.setOrientationLeft();
  try{
   activity=rule.launchActivity(null);waitFor("!!window.AvsarGoEvent&&document.getElementById('history').children.length>0&&window.innerWidth>=760");
   assertEquals("true",js("document.getElementById('drawer').getBoundingClientRect().left>=0&&document.getElementById('drawer').getBoundingClientRect().width>=200&&document.body.scrollWidth<=window.innerWidth"));
   assertEquals("true",js("document.getElementById('openPreferences').getBoundingClientRect().bottom<=innerHeight&&document.getElementById('openPreferences').getBoundingClientRect().top>=0"));
   assertEquals("false",js("/Enable chat|Start chatting with AvsarGo|Settings & admin/.test(document.body.innerText)"));
   File dir=new File(context.getExternalFilesDir(null),"verification");dir.mkdirs();device.takeScreenshot(new File(dir,"native-landscape-home.png"));
   js("document.getElementById('headerDocs').click()");waitFor("!document.getElementById('modal').hidden&&document.getElementById('sheetTitle').innerText==='Your documents'");
   js("document.getElementById('closeSheet').click();document.getElementById('openPreferences').click()");waitFor("!document.getElementById('modal').hidden&&document.getElementById('sheetTitle').innerText==='Preferences & privacy'");
   assertEquals("false",js("/AI chat|Enable chat/.test(document.getElementById('sheetBody').innerText)"));
   device.takeScreenshot(new File(dir,"native-landscape-preferences.png"));
  }finally{device.setOrientationNatural();device.unfreezeRotation();}
 }
 @Test public void preferencesProfileAndSessionRoundTripAcrossInstances()throws Exception{
  vault.saveAiSettings(new JSONObject().put("automationConsent",true).put("permissionsVersion",1));
  vault.saveProfile(new JSONObject().put("fullName","Synthetic Applicant"));
  vault.setDeviceToken("synthetic-session-for-storage-test");
  SecureVault recreated=new SecureVault(context);assertTrue(recreated.automationAllowed());assertEquals("Synthetic Applicant",recreated.getProfile().getString("fullName"));assertEquals("synthetic-session-for-storage-test",recreated.deviceToken());
  recreated.saveAiSettings(new JSONObject().put("automationConsent",false).put("permissionsVersion",1));assertFalse(new SecureVault(context).automationAllowed());
 }
 @Test public void interruptedAtomicWritePreservesPreviouslyReviewedProfile()throws Exception{
  vault.saveProfile(new JSONObject().put("fullName","Original reviewed value"));AtomicFile atomic=new AtomicFile(new File(context.getFilesDir(),"profile.sec"));FileOutputStream out=atomic.startWrite();out.write(new byte[]{1,2,3});atomic.failWrite(out);
  assertEquals("Original reviewed value",new SecureVault(context).getProfile().getString("fullName"));
 }
 @Test public void concurrentColdVaultInstancesUseOneValidEncryptionKey()throws Exception{
  ExecutorService pool=Executors.newFixedThreadPool(4);java.util.List<Future<?>> tasks=new java.util.ArrayList<>();
  try{for(int i=0;i<8;i++){final int n=i;tasks.add(pool.submit(()->{try{new SecureVault(context).saveProfile(new JSONObject().put("fullName","Synthetic "+n));}catch(Exception e){throw new RuntimeException(e);}}));}for(Future<?> task:tasks)task.get(30,TimeUnit.SECONDS);assertTrue(new SecureVault(context).getProfile().getString("fullName").startsWith("Synthetic "));}finally{pool.shutdownNow();}
 }
}
