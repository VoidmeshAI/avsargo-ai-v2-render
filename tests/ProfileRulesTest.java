import com.avsargo.mobile.ProfileRules;
import java.util.Map;
import java.util.LinkedHashMap;
public final class ProfileRulesTest {
    static int count=0;
    static void check(boolean ok,String description){if(!ok)throw new AssertionError(description);count++;}
    static void invalid(String key,String value){try{ProfileRules.validate(Map.of(key,value));throw new AssertionError("Accepted invalid "+key);}catch(IllegalArgumentException expected){count++;}}
    public static void main(String[] args){
        Map<String,String> fields=ProfileRules.fromOcr("Name: Test Applicant\nFather's Name: Test Parent\nMother's Name: Test Mother\nDate of Birth: 21/01/2024\nMobile: +91 9876543210\nAddress: Sample Lane\nEmail: test@example.com\nAadhaar: 9876 5432 1098");
        check("Test Applicant".equals(fields.get("fullName")),"Name parse with real newlines");
        check("Test Parent".equals(fields.get("fatherName")),"Father parse");
        check("Test Mother".equals(fields.get("motherName")),"Mother parse");
        check("21/01/2024".equals(fields.get("dob")),"DOB parse");
        check("9876543210".equals(fields.get("mobile")),"Mobile normalization");
        check(!fields.containsKey("aadhaar"),"No ID extraction");
        check(!ProfileRules.fromOcr("Father's Name: Parent Only").containsKey("fullName"),"Father never becomes applicant name");
        check(!ProfileRules.fromOcr("Aadhaar: 987654321098").containsKey("mobile"),"ID fragment never becomes phone");
        check("21/01/2024".equals(ProfileRules.validate(Map.of("dob","2024-01-21")).get("dob")),"ISO review date");
        check("Sunil Sharma".equals(ProfileRules.fromOcr("नाम: Sunil Sharma\nपिता का नाम: Sample Parent").get("fullName")),"Hindi label parse");
        invalid("dob","31/02/2024");invalid("dob","01/01/2999");invalid("mobile","123");invalid("email","bad@email");invalid("pincode","000000");
        check(ProfileRules.validate(Map.of("password","secret","aadhaar","1234")).isEmpty(),"Unknown/secret keys rejected");
        check(ProfileRules.validate(Map.of("pincode","110001")).get("pincode").equals("110001"),"Postal pincode supported");
        check(ProfileRules.fromOcr("DOB: 31/02/2024").isEmpty(),"Invalid OCR date withheld");
        check(!ProfileRules.fromOcr("Issue date: 21/01/2024").containsKey("dob"),"Issue date not DOB");
        System.out.println("Profile/OCR rules: "+count+" checks passed");
    }
}
