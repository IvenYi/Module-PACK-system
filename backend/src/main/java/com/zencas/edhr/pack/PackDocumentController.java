package com.zencas.edhr.pack;

import com.zencas.edhr.compliance.controller.FileController;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.io.IOException;

@RestController
@RequestMapping("/api/v1/pack/documents")
public class PackDocumentController {
    private final PackService service;
    private final FileController files;
    public PackDocumentController(PackService service,FileController files){this.service=service;this.files=files;}
    @GetMapping("/{fileId}/preview")
    public ResponseEntity<?> preview(@PathVariable Long fileId,@RequestParam Long siteId,@RequestParam String objectId,@RequestParam(defaultValue="1") int page) throws IOException {
        service.authorizeDocument(fileId.toString(),siteId,objectId,page);
        return files.pagePreview(fileId,page);
    }
}
