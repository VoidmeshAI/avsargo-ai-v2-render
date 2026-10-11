package com.avsargo.mobile;
import java.time.LocalDate;
import java.time.format.*;
import java.util.*;
import java.util.regex.*;
/** Only reviewed applicant facts. Credentials, OTPs and payment secrets are never profile fields. */
public final class ProfileRules {
 public static final String[] KEYS=ProfileFields.KEYS,LABELS=ProfileFields.LABELS;
 private ProfileRules(){}
 public static boolean allowed(String key){return Arrays.asList(KEYS).contains(key)||Arrays.asList("dobDay","dobMonth","dobYear").contains(key)||key.matches("extra_[a-f0-9]{16}");}
 public static String label(String key){for(int i=0;i<KEYS.length;i++)if(KEYS[i].equals(key))return LABELS[i];return "Form detail";}
 public static boolean secret(String label){return Pattern.compile("password|\\bpwd\\b|login|user.?name|user.?id|otp|one.?time|captcha|cvv|cvc|card.?number|upi.?pin|payment|transaction|declar|consent|पासवर्ड|ओटीपी|भुगतान",Pattern.CASE_INSENSITIVE).matcher(label).find();}
 public static String valueFor(Map<String,String> profile,String key){if(Arrays.asList("dobDay","dobMonth","dobYear").contains(key)){String d=profile.getOrDefault("dob","");String[] p=d.split("/");if(p.length!=3)return "";return p[key.equals("dobDay")?0:key.equals("dobMonth")?1:2];}return profile.getOrDefault(key,"");}
 public static Map<String,String> validate(Map<String,String> input){return validate(input,Collections.emptyMap());}
 public static Map<String,String> validate(Map<String,String> input,Map<String,String> extraLabels){
  Map<String,String> out=new LinkedHashMap<>();for(Map.Entry<String,String> e:input.entrySet()){
   String key=e.getKey();boolean extra=key.matches("extra_[a-f0-9]{16}")&&extraLabels.containsKey(key)&&!secret(extraLabels.get(key));
   if(!Arrays.asList(KEYS).contains(key)&&!extra)continue;String value=e.getValue()==null?"":e.getValue().trim();if(value.isEmpty())continue;
   if(value.length()>(key.equals("address")?700:240)||Pattern.compile("[\\p{Cntrl}&&[^\\n\\r\\t]]").matcher(value).find())throw new IllegalArgumentException(label(key)+": value is too long or invalid");
   if(key.equals("mobile")){value=value.replaceAll("[\\s()-]","").replaceFirst("^(?:\\+91|0091)","");if(!value.matches("[6-9][0-9]{9}"))throw new IllegalArgumentException("Mobile: enter 10 digits");}
   if(key.equals("email")&&!value.matches("[^\\s@]+@[^\\s@]+\\.[^\\s@]+"))throw new IllegalArgumentException("Email: check the address");
   if(Arrays.asList("aadhaarNumber","bankAccount","pincode").contains(key))value=value.replaceAll("[ -]","");
   if(key.equals("aadhaarNumber")&&!validAadhaar(value))throw new IllegalArgumentException("Aadhaar: check all 12 printed digits");
   if(Arrays.asList("panNumber","passportNumber","gstin","ifsc","udyamNumber").contains(key))value=value.toUpperCase(Locale.ROOT).replace(" ","");
   String pattern=key.equals("panNumber")?"[A-Z]{5}[0-9]{4}[A-Z]":key.equals("passportNumber")?"[A-Z][0-9]{7}":key.equals("ifsc")?"[A-Z]{4}0[A-Z0-9]{6}":key.equals("gstin")?"[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]":key.equals("udyamNumber")?"UDYAM-[A-Z]{2}-[0-9]{2}-[0-9]{7}":key.equals("bankAccount")?"[0-9]{6,24}":key.equals("pincode")?"[1-9][0-9]{5}":"";
   if(!pattern.isEmpty()&&!value.matches(pattern))throw new IllegalArgumentException(label(key)+": check the printed value");
   if(key.equals("passingYear")&&(!value.matches("[0-9]{4}")||Integer.parseInt(value)<1950||Integer.parseInt(value)>LocalDate.now().getYear()))throw new IllegalArgumentException("Passing year: check the year");
   if(key.equals("percentage")){value=value.replace("%","");if(!value.matches("[0-9]{1,3}(?:\\.[0-9]{1,2})?")||Double.parseDouble(value)>100)throw new IllegalArgumentException("Percentage: enter 0 to 100");}
   if(key.equals("annualIncome")||key.equals("annualTurnover")){value=value.replaceAll("[₹, ]","").replaceFirst("(?i)^rs\\.?","");if(!value.matches("[0-9]{1,15}(?:\\.[0-9]{1,2})?"))throw new IllegalArgumentException(label(key)+": enter an amount in rupees");}
   if(key.equals("rollNumber")&&!value.matches("[\\p{L}0-9 /.-]{1,60}"))throw new IllegalArgumentException("Roll number: check the value");
   if(key.equals("dob")||key.equals("commencementDate")){try{LocalDate date=value.matches("\\d{4}-\\d{2}-\\d{2}")?LocalDate.parse(value):LocalDate.parse(value.replace('-','/').replace('.','/'),DateTimeFormatter.ofPattern("d/M/uuuu").withResolverStyle(ResolverStyle.STRICT));if(date.isAfter(LocalDate.now())||date.getYear()<1900)throw new IllegalArgumentException();value=date.format(DateTimeFormatter.ofPattern("dd/MM/uuuu"));}catch(Exception ex){throw new IllegalArgumentException(label(key)+": enter a real date as DD/MM/YYYY");}}
   out.put(key,value);
  }return out;
 }
 public static boolean validAadhaar(String value){if(!value.matches("[2-9][0-9]{11}"))return false;int[][] d={{0,1,2,3,4,5,6,7,8,9},{1,2,3,4,0,6,7,8,9,5},{2,3,4,0,1,7,8,9,5,6},{3,4,0,1,2,8,9,5,6,7},{4,0,1,2,3,9,5,6,7,8},{5,9,8,7,6,0,4,3,2,1},{6,5,9,8,7,1,0,4,3,2},{7,6,5,9,8,2,1,0,4,3},{8,7,6,5,9,3,2,1,0,4},{9,8,7,6,5,4,3,2,1,0}},p={{0,1,2,3,4,5,6,7,8,9},{1,5,7,6,2,8,3,0,9,4},{5,8,0,3,7,9,6,1,4,2},{8,9,1,6,0,4,3,5,2,7},{9,4,5,3,1,2,6,8,7,0},{4,2,8,6,5,7,3,9,0,1},{2,7,9,3,8,0,6,4,1,5},{7,0,4,6,9,1,3,2,5,8}};int c=0;for(int i=0;i<value.length();i++)c=d[c][p[i%8][value.charAt(value.length()-1-i)-'0']];return c==0;}
 public static Map<String,String> fromOcr(String text){Map<String,String> out=new LinkedHashMap<>();String[] lines=text.split("\\r?\\n");Map<String,String> aliases=new LinkedHashMap<>();for(int i=0;i<KEYS.length;i++)aliases.put(KEYS[i],Pattern.quote(LABELS[i]) + "|"+Pattern.quote(KEYS[i].replaceAll("([a-z])([A-Z])","$1 $2")));
  aliases.put("fullName","full name|applicant name|candidate name|name of holder|name|पूरा नाम|नाम");aliases.put("fatherName","father['’]?s? name|पिता (?:का )?नाम");aliases.put("motherName","mother['’]?s? name|माता (?:का )?नाम");aliases.put("dob","dob|date of birth|जन्म (?:तिथि|दिनांक)");aliases.put("mobile","mobile(?: number| no)?|phone|contact(?: number| no)?|मोबाइल");aliases.put("aadhaarNumber","aadhaar(?: number| no)?|aadhar(?: number| no)?|uid|आधार(?: नंबर)?");aliases.put("panNumber","pan(?: number| no)?");aliases.put("address","address|residential address|permanent address|पता");aliases.put("bankAccount","account(?: number| no)|bank account(?: number)?");aliases.put("ifsc","ifsc(?: code)?");aliases.put("pincode","pin code|pincode|postal pin code|postal code");aliases.put("enterpriseName","enterprise name|name of enterprise|business name|उद्यम का नाम");
  for(Map.Entry<String,String> a:aliases.entrySet()){Pattern p=Pattern.compile("^(?:"+a.getValue()+")\\s*[:：-]\\s*(.+)$",Pattern.CASE_INSENSITIVE|Pattern.UNICODE_CASE);for(String line:lines){Matcher m=p.matcher(line.trim());if(m.matches()){String v=m.group(1).trim();if(!out.containsKey(a.getKey())){try{out.putAll(validate(Collections.singletonMap(a.getKey(),v)));}catch(Exception ignored){}}}}}return out;
 }
}
