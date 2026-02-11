import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Home, AlertTriangle } from "lucide-react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="glass-effect shadow-floating max-w-md w-full">
        <div className="p-8 text-center space-y-6">
          <div className="h-20 w-20 mx-auto rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="h-10 w-10 text-destructive" />
          </div>
          
          <div className="space-y-2">
            <h1 className="text-4xl font-bold bg-gradient-ai bg-clip-text text-transparent">404</h1>
            <h2 className="text-xl font-semibold">Страница не найдена</h2>
            <p className="text-muted-foreground">
              К сожалению, запрашиваемая страница не существует или была перемещена.
            </p>
          </div>

          <Button 
            asChild 
            className="bg-gradient-ai hover:shadow-glow transition-all"
          >
            <Link to="/">
              <Home className="h-4 w-4 mr-2" />
              Вернуться на главную
            </Link>
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default NotFound;
