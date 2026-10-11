package com.avsargo.mobile;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.ResolverStyle;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Shared review/OCR rules. Does not accept government IDs or login/payment secrets. */
public final class ProfileRules {
    public static final String[] KEYS={"fullName","firstName","middleName","lastName","fatherName","motherName",
        "dob","mobile","email","address","state","city","district","pincode","gender","nationality","qualification",
        "category","domicile","board","school","passingYear","percentage","course","rollNumber"};
    public static final String[] LABELS={"Full name","First name","Middle name","Last name","Father's name","Mother's name",
        "Date of birth","Mobile number","Email","Address","State","City","District","Postal PIN code","Gender","Nationality","Highest qualification",
        "Category","Domicile state","Education board / university","School / college","Passing year","Percentage","Course / discipline","Education roll number"};
    private ProfileRules(){}
    public static String label(String key){for(int i=0;i<KEYS.length;i++)if(KEYS[i].equals(key))return LABELS[i];return "Form detail";}
    public static Map<String,String> validate(Map<String,String> input){
        Map<String,String> out=new LinkedHashMap<>();
        for(String key:KEYS){
            String value=input.getOrDefault(key,"").trim();if(value.isEmpty())continue;
            int max="address".equals(key)?500:180;
            if(value.length()>max||Pattern.compile("[\\p{Cntrl}&&[^\\n\\r\\t]]").matcher(value).find())
                throw new IllegalArgumentException(label(key)+": value is too long or invalid");
            if("mobile".equals(key)){
                value=value.replaceAll("[\\s()-]","").replaceFirst("^(?:\\+91|0091)","");
                if(!value.matches("[6-9][0-9]{9}"))throw new IllegalArgumentException("Mobile: enter 10 digits");
            }else if("email".equals(key)&&!value.matches("[^\\s@]+@[^\\s@]+\\.[^\\s@]+"))
                throw new IllegalArgumentException("Email: enter a valid address");
            else if("pincode".equals(key)&&!value.matches("[1-9][0-9]{5}"))
                throw new IllegalArgumentException("Postal PIN code: enter 6 digits");
            else if("passingYear".equals(key)&&(!value.matches("[0-9]{4}")||Integer.parseInt(value)<1950||Integer.parseInt(value)>LocalDate.now().getYear()))
                throw new IllegalArgumentException("Passing year: enter a valid completed year");
            else if("percentage".equals(key)&&(!value.matches("[0-9]{1,3}(?:\\.[0-9]{1,2})?%?")||Double.parseDouble(value.replace("%",""))>100))
                throw new IllegalArgumentException("Percentage: enter a number from 0 to 100");
            else if("rollNumber".equals(key)&&!value.matches("[\\p{L}0-9 /.-]{1,60}"))
                throw new IllegalArgumentException("Education roll number: check the printed value");
            else if("dob".equals(key)){
                try{
                    String normalized=value.replace('-','/').replace('.','/');
                    LocalDate date=value.matches("\\d{4}-\\d{2}-\\d{2}")?LocalDate.parse(value):
                        LocalDate.parse(normalized,DateTimeFormatter.ofPattern("d/M/uuuu").withResolverStyle(ResolverStyle.STRICT));
                    if(date.isAfter(LocalDate.now())||date.getYear()<1900)throw new IllegalArgumentException();
                    value=date.format(DateTimeFormatter.ofPattern("dd/MM/uuuu"));
                }catch(Exception e){throw new IllegalArgumentException("Date of birth: enter a real date as DD/MM/YYYY");}
            }
            out.put(key,value);
        }
        return out;
    }
    public static Map<String,String> fromOcr(String text){
        Map<String,String> out=new LinkedHashMap<>();String[] lines=text.split("\\r?\\n");
        findLabel(out,lines,"fullName","(?:full\\s*name|applicant\\s*name|candidate\\s*name|name\\s*of\\s*(?:holder|applicant)|name|नाम|पूरा\\s*नाम)");
        findLabel(out,lines,"fatherName","(?:father['’]?s?\\s*name|पिता\\s*(?:का\\s*)?नाम)");
        findLabel(out,lines,"motherName","(?:mother['’]?s?\\s*name|माता\\s*(?:का\\s*)?नाम)");
        findLabel(out,lines,"address","(?:residential\\s*address|permanent\\s*address|address|पता)");
        findLabel(out,lines,"city","(?:city|शहर)");findLabel(out,lines,"state","(?:state|राज्य)");
        Matcher dob=Pattern.compile("(?:dob|date\\s*of\\s*birth|जन्म\\s*(?:तिथि|दिनांक))[^0-9]{0,14}(\\d{1,2}[-/.]\\d{1,2}[-/.]\\d{4})",Pattern.CASE_INSENSITIVE).matcher(text);
        if(dob.find())out.put("dob",dob.group(1));
        Matcher mail=Pattern.compile("[a-zA-Z0-9._%+\\-]+@[a-zA-Z0-9.\\-]+\\.[a-zA-Z]{2,}").matcher(text);
        if(mail.find())out.put("email",mail.group());
        // An unlabeled ID fragment must never be interpreted as a contact number.
        Matcher mobile=Pattern.compile("(?:mobile|phone|contact\\s*(?:no|number)?|मोबाइल|फोन)[^0-9+]{0,12}((?:\\+91[ -]?)?[6-9][0-9 -]{8,14}[0-9])",Pattern.CASE_INSENSITIVE).matcher(text);
        if(mobile.find())out.put("mobile",mobile.group(1));
        Map<String,String> safe=new LinkedHashMap<>();
        for(Map.Entry<String,String> e:out.entrySet()){
            try{safe.putAll(validate(java.util.Collections.singletonMap(e.getKey(),e.getValue())));}catch(IllegalArgumentException ignored){}
        }
        return safe;
    }
    private static void findLabel(Map<String,String> out,String[] lines,String key,String label){
        Pattern p=Pattern.compile("^(?:"+label+")\\s*(?:[:：-]\\s*|\\s+)(.+)$",Pattern.CASE_INSENSITIVE|Pattern.UNICODE_CASE);
        for(String line:lines){Matcher m=p.matcher(line.trim());if(!m.matches())continue;
            String value=m.group(1).replaceAll("(?i)\\s+(?:dob|date of birth|sex|gender|पिता|माता)\\b.*$","").trim();
            if(value.length()>=2&&value.length()<180&&!value.matches(".*\\d{7,}.*")&&!("fullName".equals(key)&&value.matches("(?i).*(father|mother).*"))){out.put(key,value);return;}
        }
    }
}
