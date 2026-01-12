"""PDF text extraction with scanned document detection."""
from pathlib import Path
from typing import Optional
import fitz  # PyMuPDF

from .base import BaseExtractor, ExtractionResult
from docsearch.config import get_config


class PDFExtractor(BaseExtractor):
    """Extract text from PDF files, with OCR fallback for scanned documents."""

    @property
    def supported_extensions(self) -> list[str]:
        return [".pdf"]

    def extract(self, file_path: Path) -> ExtractionResult:
        try:
            doc = fitz.open(file_path)
            text_parts = []
            total_chars = 0

            for page in doc:
                page_text = page.get_text()
                text_parts.append(page_text)
                total_chars += len(page_text)

            doc_metadata = doc.metadata or {}
            page_count = len(doc)
            doc.close()

            avg_chars_per_page = total_chars / page_count if page_count > 0 else 0
            config = get_config()
            threshold = config.ocr.scanned_threshold_chars_per_page

            # Check if document appears to be scanned
            if avg_chars_per_page < threshold and config.ocr.enabled:
                return self._extract_with_ocr(file_path, doc_metadata, page_count)

            text = "\n\n".join(text_parts)
            
            return ExtractionResult(
                success=True,
                text=text,
                metadata={
                    "page_count": page_count,
                    "title": doc_metadata.get("title"),
                    "author": doc_metadata.get("author"),
                    "created_date": self._parse_pdf_date(doc_metadata.get("creationDate")),
                    "modified_date": self._parse_pdf_date(doc_metadata.get("modDate")),
                },
                extraction_method="direct"
            )
        except Exception as e:
            return ExtractionResult(success=False, error=str(e))

    def _extract_with_ocr(self, file_path: Path, doc_metadata: dict, page_count: int) -> ExtractionResult:
        """Extract text using OCR for scanned PDFs with preprocessing."""
        try:
            import pytesseract
            from PIL import Image, ImageEnhance, ImageFilter
            import io

            config = get_config()
            doc = fitz.open(file_path)
            text_parts = []

            for page_num in range(len(doc)):
                page = doc[page_num]
                # Render page to image at 300 DPI for better OCR
                mat = fitz.Matrix(300/72, 300/72)
                pix = page.get_pixmap(matrix=mat)
                img_data = pix.tobytes("png")
                img = Image.open(io.BytesIO(img_data))
                
                # Preprocess image
                img = self._preprocess_for_ocr(img)
                
                # OCR with optimized settings
                custom_config = r'--oem 3 --psm 6'
                page_text = pytesseract.image_to_string(
                    img, 
                    lang=config.ocr.language,
                    config=custom_config
                )
                text_parts.append(page_text)

            doc.close()
            text = "\n\n".join(text_parts)

            return ExtractionResult(
                success=True,
                text=text,
                metadata={
                    "page_count": page_count,
                    "title": doc_metadata.get("title"),
                    "author": doc_metadata.get("author"),
                    "created_date": self._parse_pdf_date(doc_metadata.get("creationDate")),
                    "modified_date": self._parse_pdf_date(doc_metadata.get("modDate")),
                },
                extraction_method="ocr"
            )
        except ImportError:
            return ExtractionResult(
                success=False, 
                error="OCR dependencies not installed. Run: pip install pytesseract pillow && brew install tesseract"
            )
        except Exception as e:
            return ExtractionResult(success=False, error=f"OCR failed: {e}")
    
    def _preprocess_for_ocr(self, img):
        """Preprocess image for better OCR accuracy."""
        from PIL import Image, ImageEnhance, ImageFilter
        
        # Convert to grayscale
        if img.mode != 'L':
            img = img.convert('L')
        
        # Enhance contrast
        enhancer = ImageEnhance.Contrast(img)
        img = enhancer.enhance(1.5)
        
        # Sharpen
        img = img.filter(ImageFilter.SHARPEN)
        
        # Binarization
        threshold = 150
        img = img.point(lambda p: 255 if p > threshold else 0)
        
        return img

    def _parse_pdf_date(self, date_str: Optional[str]) -> Optional[str]:
        """Parse PDF date format (D:YYYYMMDDHHmmSS) to ISO format."""
        if not date_str:
            return None
        try:
            # Remove D: prefix if present
            if date_str.startswith("D:"):
                date_str = date_str[2:]
            # Take first 8 chars for YYYYMMDD
            if len(date_str) >= 8:
                year = date_str[0:4]
                month = date_str[4:6]
                day = date_str[6:8]
                return f"{year}-{month}-{day}"
        except:
            pass
        return None

    def is_scanned(self, file_path: Path) -> bool:
        """Check if PDF appears to be scanned (low text density)."""
        try:
            doc = fitz.open(file_path)
            total_chars = sum(len(page.get_text()) for page in doc)
            page_count = len(doc)
            doc.close()
            
            avg_chars = total_chars / page_count if page_count > 0 else 0
            threshold = get_config().ocr.scanned_threshold_chars_per_page
            return avg_chars < threshold
        except:
            return False
