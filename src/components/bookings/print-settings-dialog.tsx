'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';

export interface PrintSettings {
  showPrices: boolean;
  showCost: boolean;
  showProfit: boolean;
  showPortal: boolean;
  showSupplier: boolean;
  showReferences: boolean;
  showRemarks: boolean;
  showTimeline: boolean;
  showDocuments: boolean;
}

interface PrintSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: PrintSettings;
  onSettingsChange: (settings: PrintSettings) => void;
  onPrint: () => void;
}

const defaultSettings: PrintSettings = {
  showPrices: true,
  showCost: false,
  showProfit: false,
  showPortal: true,
  showSupplier: true,
  showReferences: true,
  showRemarks: true,
  showTimeline: false,
  showDocuments: false,
};

export function PrintSettingsDialog({
  open,
  onOpenChange,
  settings,
  onSettingsChange,
  onPrint,
}: PrintSettingsDialogProps) {
  const handleSettingChange = (key: keyof PrintSettings, checked: boolean) => {
    onSettingsChange({ ...settings, [key]: checked });
  };

  const handleResetDefaults = () => {
    onSettingsChange(defaultSettings);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Print Settings</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div>
            <h4 className="text-sm font-medium mb-3">Financial Information</h4>
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="showPrices"
                  checked={settings.showPrices}
                  onCheckedChange={(checked) => handleSettingChange('showPrices', checked as boolean)}
                />
                <Label htmlFor="showPrices" className="text-sm">Show Customer Price</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="showCost"
                  checked={settings.showCost}
                  onCheckedChange={(checked) => handleSettingChange('showCost', checked as boolean)}
                />
                <Label htmlFor="showCost" className="text-sm">Show Supplier Cost</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="showProfit"
                  checked={settings.showProfit}
                  onCheckedChange={(checked) => handleSettingChange('showProfit', checked as boolean)}
                />
                <Label htmlFor="showProfit" className="text-sm">Show Profit</Label>
              </div>
            </div>
          </div>

          <Separator />

          <div>
            <h4 className="text-sm font-medium mb-3">Booking Details</h4>
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="showPortal"
                  checked={settings.showPortal}
                  onCheckedChange={(checked) => handleSettingChange('showPortal', checked as boolean)}
                />
                <Label htmlFor="showPortal" className="text-sm">Show Booking Portal</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="showSupplier"
                  checked={settings.showSupplier}
                  onCheckedChange={(checked) => handleSettingChange('showSupplier', checked as boolean)}
                />
                <Label htmlFor="showSupplier" className="text-sm">Show Supplier Information</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="showReferences"
                  checked={settings.showReferences}
                  onCheckedChange={(checked) => handleSettingChange('showReferences', checked as boolean)}
                />
                <Label htmlFor="showReferences" className="text-sm">Show References (PNR/Booking ID)</Label>
              </div>
            </div>
          </div>

          <Separator />

          <div>
            <h4 className="text-sm font-medium mb-3">Additional Information</h4>
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="showRemarks"
                  checked={settings.showRemarks}
                  onCheckedChange={(checked) => handleSettingChange('showRemarks', checked as boolean)}
                />
                <Label htmlFor="showRemarks" className="text-sm">Show Remarks/Notes</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="showTimeline"
                  checked={settings.showTimeline}
                  onCheckedChange={(checked) => handleSettingChange('showTimeline', checked as boolean)}
                />
                <Label htmlFor="showTimeline" className="text-sm">Show Timeline</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="showDocuments"
                  checked={settings.showDocuments}
                  onCheckedChange={(checked) => handleSettingChange('showDocuments', checked as boolean)}
                />
                <Label htmlFor="showDocuments" className="text-sm">Show Documents List</Label>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={handleResetDefaults} className="sm:order-1">
            Reset Defaults
          </Button>
          <div className="flex gap-2 sm:order-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={onPrint}>
              Print
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { defaultSettings };
