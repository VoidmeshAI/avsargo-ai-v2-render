import java.nio.file.*;
import java.util.*;
import javax.tools.*;
import com.sun.source.util.JavacTask;
public final class JavaSyntaxCheck {
 public static void main(String[] args)throws Exception{
  JavaCompiler compiler=ToolProvider.getSystemJavaCompiler();DiagnosticCollector<JavaFileObject> diag=new DiagnosticCollector<>();
  try(StandardJavaFileManager manager=compiler.getStandardFileManager(diag,null,null)){
   List<Path> files;try(var paths=Files.walk(Path.of(args[0]))){files=paths.filter(p->p.toString().endsWith(".java")).toList();}
   JavacTask task=(JavacTask)compiler.getTask(null,manager,diag,List.of("-proc:none"),null,manager.getJavaFileObjectsFromPaths(files));
   for(var tree:task.parse()){}
   for(var d:diag.getDiagnostics())if(d.getKind()==Diagnostic.Kind.ERROR)throw new AssertionError(d.toString());
   System.out.println("Java syntax: "+files.size()+" source files parsed. This is not Android compilation.");
  }
 }
}
