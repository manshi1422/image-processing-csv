Below is a sample technical design document for the CSV image processing system. The document describes each component, its role, and provides a visual diagram created using a diagramming tool (you can later reproduce it in Draw.io). You can adjust details based on your production requirements.

---

# Technical Design Document  
**Project:** CSV Image Processing System  
**Date:** 2025-02-24  
**Author:** [Your Name]

---

## 1. Overview

The CSV Image Processing System is a Node.js–based web service designed to efficiently process image data contained within CSV files. The system accepts CSV files that list product details and image URLs, processes the images (e.g., downloads, resizes, transforms), and outputs a CSV with an added column containing the corresponding processed image URLs.

The system exposes two RESTful APIs:
- **Upload API:** Accepts the CSV file, validates its format, and returns a unique request ID for asynchronous processing.
- **Status API:** Allows users to query the current processing status of their CSV submission using the provided request ID.

---

## 2. System Architecture

### 2.1. Components

1. **Client/Consumer:**  
   - **Role:** External client (e.g., a web interface, Postman, or another service) that uploads CSV files and checks job status.
   - **Function:** Initiates CSV processing by interacting with the Upload and Status APIs.

2. **API Server:**  
   - **Role:** Hosts the RESTful endpoints.
   - **Function:**  
     - Accepts CSV uploads using the Upload API.
     - Validates file formats.
     - Initiates CSV processing jobs.
     - Provides job status through the Status API.
   - **Technologies:** Node.js, Express, multer.

3. **CSV Processor:**  
   - **Role:** Handles CSV file parsing and image processing.
   - **Function:**  
     - Parses CSV files using `fast-csv`.
     - Validates CSV format and required columns.
     - Processes each row by extracting input image URLs.
     - For each image URL:
       - Downloads the image using `axios`.
       - Processes the image using `sharp` (e.g., resizing).
     - Generates an output CSV that includes a new column for output image URLs.
   - **Concurrency Consideration:** Runs asynchronously in the background (in production, a job queue system like Bull or Agenda could be integrated).

4. **Job Store:**  
   - **Role:** In-memory storage to track processing jobs.
   - **Function:**  
     - Maps a unique request ID to the processing job details.
     - Stores status updates, row counts, and output CSV file locations.
   - **Note:** For production, this can be replaced with a persistent data store (e.g., Redis, MongoDB).

5. **Storage Layer:**  
   - **Role:** File system directories or cloud storage to save the uploaded CSVs, processed images, and output CSVs.
   - **Function:**  
     - Temporary storage for uploads.
     - Storage for processed images.
     - Generation of output CSV files for later retrieval.

---

## 3. Detailed Data Flow

1. **CSV Upload and Job Creation:**  
   - A client sends a CSV file to the **Upload API**.
   - The API server validates the file type (ensuring it's a CSV).
   - A unique request ID is generated and a new job record is created in the **Job Store**.
   - The CSV file is stored in a temporary directory.
   - The job is handed off to the **CSV Processor** for asynchronous processing.

2. **CSV Processing:**  
   - The CSV Processor reads the CSV file using `fast-csv`.
   - Each row is validated and parsed. Required fields include Serial Number, Product Name, and Input Image Urls.
   - For each image URL:
     - The image is downloaded using `axios`.
     - Image processing is performed with `sharp` (e.g., resizing).
     - The processed image is saved and its URL (or file path) is noted.
   - The CSV Processor writes a new output CSV file that includes the processed image URLs in the same order as input.
   - The **Job Store** record is updated with job completion details (status, processed rows, output CSV location).

3. **Job Status Query:**  
   - A client sends a request to the **Status API** with the unique request ID.
   - The API server queries the **Job Store** and returns the current job status (e.g., processing, completed, failed) along with processing details.

---

## 4. Visual Diagram

Below is a diagram representing the system architecture. You can recreate this diagram in Draw.io (or a similar tool):

```
                     ┌─────────────────────────────┐
                     │        Client/Consumer      │
                     │  (Web UI, Postman, etc.)    │
                     └─────────────┬───────────────┘
                                   │
                   CSV Upload & Status Check
                                   │
                                   ▼
                     ┌─────────────────────────────┐
                     │        API Server           │
                     │  (Express, Node.js)         │
                     └─────────────┬───────────────┘
                                   │
                      ┌────────────┼────────────┐
                      │                         │
                      ▼                         ▼
           ┌──────────────────┐       ┌──────────────────┐
           │   CSV Processor  │       │    Job Store     │
           │ (fast-csv, axios,│       │ (In-memory or    │
           │     sharp)       │       │ persistent store)│
           └────────────┬─────┘       └──────────────────┘
                        │
                        ▼
           ┌─────────────────────────────┐
           │       Storage Layer         │
           │ (Uploads, Processed Images, │
           │  Output CSV files)          │
           └─────────────────────────────┘
```

**Component Roles in Diagram:**

- **Client/Consumer:** Initiates API calls for uploading CSV files and checking job status.
- **API Server:** Acts as the gateway for requests, delegating CSV processing and providing status updates.
- **CSV Processor:** Reads, validates, processes CSV content, and performs image processing tasks.
- **Job Store:** Tracks processing jobs, their statuses, and metadata.
- **Storage Layer:** Handles physical storage for CSV files and images.

---

## 5. Component Functions

- **API Server:**  
  - **Endpoints:**
    - `/api/upload`: Accepts file uploads, validates file type, generates request IDs, and initiates processing.
    - `/api/status/:requestId`: Retrieves the status of the processing job.
  - **Middleware:** Uses `multer` for file uploads.

- **CSV Processor:**  
  - **Input:** CSV file with Serial Number, Product Name, and comma-separated Input Image URLs.
  - **Processing:**  
    - Reads the CSV using `fast-csv`.
    - Downloads images with `axios`.
    - Processes images with `sharp`.
    - Writes output CSV with additional Output Image Urls.
  - **Concurrency:** Sequential processing shown; can be extended to parallel processing.

- **Job Store:**  
  - **Storage:** In-memory JavaScript object mapping request IDs to job data.
  - **Data Fields:**  
    - `requestId`
    - `status` (e.g., processing, completed, failed)
    - `processedRows`
    - `totalRows`
    - `outputFile` (path or URL)

- **Storage Layer:**  
  - **Uploads Directory:** Temporary storage for CSV uploads.
  - **Output Directory:** Storage for processed images and generated output CSV files.
  - **Scalability Considerations:** For production, consider cloud storage (e.g., AWS S3).

---

## 6. Error Handling & Scalability

- **Error Handling:**  
  - Validate CSV format before processing.
  - Handle download or processing errors for each image gracefully.
  - Update job status to "failed" in the Job Store if unrecoverable errors occur.
  - Log errors for troubleshooting.

- **Scalability:**  
  - Use asynchronous processing for CSV jobs.
  - In production, replace the in-memory Job Store with a persistent data store.
  - Consider using a job queue system (e.g., Bull) for handling large volumes of CSV uploads.
  - Use cloud storage for scalability and reliability in storing files.

---

## 7. Conclusion

This design outlines a modular system for processing CSV files containing image data. Each component is responsible for a clear set of functions, making the system easier to maintain, scale, and enhance over time. The diagram provides a visual summary of data flow and component interactions. With this design, you can extend or modify components (such as adding parallel processing or cloud storage) as needed in a production environment.

---

##Link to POSTMAN Collection - https://documenter.getpostman.com/view/23237635/2sAYdeKrG7#9febf3e1-00f8-4d1b-9489-5458c90de83e
