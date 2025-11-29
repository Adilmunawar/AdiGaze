import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type UploadDateFilterValue = "all" | "24h" | "3d" | "7d" | "30d";

interface UploadDateFilterProps {
  value: UploadDateFilterValue;
  onChange: (value: UploadDateFilterValue) => void;
}

export function UploadDateFilter({ value, onChange }: UploadDateFilterProps) {
  return (
    <div>
      <Label htmlFor="upload-date" className="text-sm font-medium mb-2 block">
        Uploaded Within
      </Label>
      <Select value={value} onValueChange={(v) => onChange(v as UploadDateFilterValue)}>
        <SelectTrigger id="upload-date">
          <SelectValue placeholder="All time" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All time</SelectItem>
          <SelectItem value="24h">Last 24 hours</SelectItem>
          <SelectItem value="3d">Last 3 days</SelectItem>
          <SelectItem value="7d">Last 7 days</SelectItem>
          <SelectItem value="30d">Last 30 days</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
