Add-Type -TypeDefinition @"
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;

public class DisplayNoneIconGenerator
{
    public static void CreateIcon(int size, string outputPath)
    {
        using (var bmp = new Bitmap(size, size))
        using (var g = Graphics.FromImage(bmp))
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
            g.PixelOffsetMode = PixelOffsetMode.HighQuality;

            // Background: Dark squircle #0f172a
            float pad = size * 0.04f;
            float arcSize = size * 0.28f;
            float w = size - (pad * 2f);
            float h = size - (pad * 2f);

            using (var path = new GraphicsPath())
            {
                path.AddArc(pad, pad, arcSize, arcSize, 180, 90);
                path.AddArc(pad + w - arcSize, pad, arcSize, arcSize, 270, 90);
                path.AddArc(pad + w - arcSize, pad + h - arcSize, arcSize, arcSize, 0, 90);
                path.AddArc(pad, pad + h - arcSize, arcSize, arcSize, 90, 90);
                path.CloseFigure();

                using (var bgBrush = new SolidBrush(Color.FromArgb(15, 23, 42)))
                {
                    g.FillPath(bgBrush, path);
                }
            }

            // Eye shape (Rose #f43f5e): two arcs forming a lens + pupil
            float penWidth = Math.Max(1.5f, size * 0.085f);
            using (var rosePen = new Pen(Color.FromArgb(244, 63, 94), penWidth))
            {
                rosePen.StartCap = LineCap.Round;
                rosePen.EndCap = LineCap.Round;

                float cx = size * 0.5f;
                float cy = size * 0.5f;
                float rx = size * 0.30f;
                float ry = size * 0.19f;

                // Upper eye arc (left to right)
                g.DrawArc(rosePen, cx - rx, cy - ry, rx * 2f, ry * 2f, 195, 150);
                // Lower eye arc (right to left)
                g.DrawArc(rosePen, cx - rx, cy - ry, rx * 2f, ry * 2f, 15, 150);

                // Pupil
                float pr = size * 0.095f;
                using (var pupilBrush = new SolidBrush(Color.FromArgb(244, 63, 94)))
                {
                    g.FillEllipse(pupilBrush, cx - pr, cy - pr, pr * 2f, pr * 2f);
                }
            }

            // Slash line (crossing the eye out) in background color, then a slate outline
            using (var slashPen = new Pen(Color.FromArgb(15, 23, 42), Math.Max(2.5f, size * 0.15f)))
            {
                slashPen.StartCap = LineCap.Round;
                slashPen.EndCap = LineCap.Round;
                g.DrawLine(slashPen, size * 0.78f, size * 0.24f, size * 0.22f, size * 0.76f);
            }
            using (var slashEdge = new Pen(Color.FromArgb(148, 163, 184), Math.Max(1.0f, size * 0.045f)))
            {
                slashEdge.StartCap = LineCap.Round;
                slashEdge.EndCap = LineCap.Round;
                g.DrawLine(slashEdge, size * 0.78f, size * 0.24f, size * 0.22f, size * 0.76f);
            }

            bmp.Save(outputPath, ImageFormat.Png);
        }
    }
}
"@ -ReferencedAssemblies System.Drawing

$iconDir = Join-Path $PSScriptRoot "icons"
if (!(Test-Path $iconDir)) {
    New-Item -ItemType Directory -Path $iconDir | Out-Null
}

[DisplayNoneIconGenerator]::CreateIcon(16, (Join-Path $iconDir "icon16.png"))
[DisplayNoneIconGenerator]::CreateIcon(32, (Join-Path $iconDir "icon32.png"))
[DisplayNoneIconGenerator]::CreateIcon(48, (Join-Path $iconDir "icon48.png"))
[DisplayNoneIconGenerator]::CreateIcon(128, (Join-Path $iconDir "icon128.png"))
Write-Output "displayNONE icons generated successfully!"
