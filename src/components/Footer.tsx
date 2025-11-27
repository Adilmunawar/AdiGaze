import { MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

const Footer = () => {
  const handleSupportClick = () => {
    const phoneNumber = '923244965220';
    const message = encodeURIComponent('Hi, I wanna support your AdiLink project');
    window.open(`https://wa.me/${phoneNumber}?text=${message}`, '_blank');
  };

  return (
    <footer className="w-full py-6 border-t border-border/40 bg-background/60 backdrop-blur-sm">
      <div className="container mx-auto px-4">
        <div className="flex flex-col items-center justify-center gap-3">
          <p className="text-center text-sm text-muted-foreground">
            Proudly Developed by Adil Munawar
          </p>
          <Button
            onClick={handleSupportClick}
            variant="outline"
            size="sm"
            className="gap-2 hover:bg-primary/10 border-primary/30"
          >
            <MessageCircle className="h-4 w-4" />
            Support this Project
          </Button>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
