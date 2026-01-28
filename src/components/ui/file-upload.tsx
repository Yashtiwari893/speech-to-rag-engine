"use client";

import { useCallback, useState } from "react";
import { cn } from "@/lib/utils";

interface FileUploadProps {
    onFileSelect?: (file: File) => void;
    onFilesSelect?: (files: File[]) => void;
    accept?: string;
    maxSize?: number; // in MB
    selectedFile?: File | null;
    selectedFiles?: File[];
    multiple?: boolean;
    maxFiles?: number;
}

export function FileUpload({
    onFileSelect,
    onFilesSelect,
    accept = ".pdf,image/*",
    maxSize = 10,
    selectedFile,
    selectedFiles = [],
    multiple = false,
    maxFiles = 50
}: FileUploadProps) {
    // Validate that appropriate callback is provided
    if (multiple && !onFilesSelect) {
        throw new Error("onFilesSelect is required when multiple=true");
    }
    if (!multiple && !onFileSelect) {
        throw new Error("onFileSelect is required when multiple=false");
    }
    const [isDragging, setIsDragging] = useState(false);

    const validateFile = useCallback((file: File): string | null => {
        // Validate file size
        if (maxSize && file.size > maxSize * 1024 * 1024) {
            return `File size must be less than ${maxSize}MB`;
        }

        // Validate file type
        const fileType = file.type;
        const acceptedTypes = accept.split(',').map(t => t.trim());
        const isValidType = acceptedTypes.some(type => {
            if (type.startsWith('.')) {
                return file.name.toLowerCase().endsWith(type.toLowerCase());
            }
            if (type.includes('/*')) {
                const baseType = type.split('/')[0];
                return fileType.startsWith(baseType + '/');
            }
            return fileType === type;
        });

        if (!isValidType) {
            return 'Invalid file type.';
        }

        return null;
    }, [accept, maxSize]);

    const handleDrag = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    }, []);

    const handleDragIn = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
            setIsDragging(true);
        }
    }, []);

    const handleDragOut = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const files = Array.from(e.dataTransfer.files);

            if (multiple && onFilesSelect) {
                // Validate max files limit
                if (files.length > maxFiles) {
                    alert(`Maximum ${maxFiles} files allowed`);
                    return;
                }

                // Validate each file
                const validFiles: File[] = [];
                const errors: string[] = [];

                files.forEach(file => {
                    const error = validateFile(file);
                    if (error) {
                        errors.push(`${file.name}: ${error}`);
                    } else {
                        validFiles.push(file);
                    }
                });

                if (errors.length > 0) {
                    alert(`Some files were rejected:\n${errors.join('\n')}`);
                }

                if (validFiles.length > 0) {
                    onFilesSelect(validFiles);
                }
            } else {
                // Single file mode
                const file = e.dataTransfer.files[0];
                const error = validateFile(file);
                if (error) {
                    alert(error);
                    return;
                }
                if (onFileSelect) {
                    onFileSelect(file);
                }
            }
        }
    }, [multiple, onFilesSelect, onFileSelect, maxFiles, validateFile]);

    const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const files = Array.from(e.target.files);

            if (multiple && onFilesSelect) {
                // Validate max files limit
                if (files.length > maxFiles) {
                    alert(`Maximum ${maxFiles} files allowed`);
                    e.target.value = '';
                    return;
                }

                // Validate each file
                const validFiles: File[] = [];
                const errors: string[] = [];

                files.forEach(file => {
                    const error = validateFile(file);
                    if (error) {
                        errors.push(`${file.name}: ${error}`);
                    } else {
                        validFiles.push(file);
                    }
                });

                if (errors.length > 0) {
                    alert(`Some files were rejected:\n${errors.join('\n')}`);
                }

                if (validFiles.length > 0) {
                    onFilesSelect(validFiles);
                }
            } else {
                // Single file mode
                const file = e.target.files[0];
                const error = validateFile(file);
                if (error) {
                    alert(error);
                    e.target.value = '';
                    return;
                }
                if (onFileSelect) {
                    onFileSelect(file);
                }
            }
        }
    }, [multiple, onFilesSelect, onFileSelect, maxFiles, validateFile]);

    const getDisplayText = () => {
        if (multiple && selectedFiles.length > 0) {
            return `${selectedFiles.length} file${selectedFiles.length > 1 ? 's' : ''} selected`;
        }
        if (selectedFile) {
            return selectedFile.name;
        }
        return multiple ? "Drop audio files here or click to select" : "Drop file here or click to select";
    };

    return (
        <div className="w-full">
            <label
                htmlFor="file-upload"
                onDragEnter={handleDragIn}
                onDragLeave={handleDragOut}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                className={cn(
                    "relative flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-lg cursor-pointer transition-colors",
                    isDragging
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-300 bg-gray-50 hover:bg-gray-100",
                    (selectedFile || selectedFiles.length > 0) && "border-green-500 bg-green-50"
                )}
            >
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <svg
                        className="w-8 h-8 mb-4 text-gray-500"
                        aria-hidden="true"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 20 16"
                    >
                        <path
                            stroke="currentColor"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M13 13h3a3 3 0 0 0 0-6h-.025A5.56 5.56 0 0 0 16 6.5 5.5 5.5 0 0 0 5.207 5.021C5.137 5.017 5.071 5 5 5a4 4 0 0 0 0 8h2.167M10 15V6m0 0L8 8m2-2 2 2"
                        />
                    </svg>
                    <p className="mb-2 text-sm text-gray-500">
                        <span className="font-semibold">{getDisplayText()}</span>
                    </p>
                    <p className="text-xs text-gray-500">
                        {multiple ? `Audio files up to ${maxSize}MB each, max ${maxFiles} files` : `${accept} up to ${maxSize}MB`}
                    </p>
                </div>
            </label>
            <input
                id="file-upload"
                type="file"
                className="hidden"
                accept={accept}
                multiple={multiple}
                onChange={handleFileInput}
            />

            {/* Selected files list for multiple mode */}
            {multiple && selectedFiles.length > 0 && (
                <div className="mt-4 space-y-2">
                    <h4 className="text-sm font-medium text-gray-700">Selected Files:</h4>
                    <div className="max-h-32 overflow-y-auto space-y-1">
                        {selectedFiles.map((file, index) => (
                            <div key={index} className="flex items-center justify-between text-sm text-gray-600 bg-gray-50 px-3 py-2 rounded">
                                <span className="truncate">{file.name}</span>
                                <span className="text-xs text-gray-500 ml-2">
                                    {(file.size / 1024 / 1024).toFixed(1)}MB
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
