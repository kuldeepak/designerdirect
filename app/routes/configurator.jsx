
// export async function action({ request }) {
//   try {
//     // =======================
//     // 1. Read form data
//     // =======================
//     const formData = await request.formData();

//     const brandName = formData.get("brand_name");
//     const bio = formData.get("bio");
//     const category = formData.get("category");
//     const phone = formData.get("phone");

//     const lookbookFile = formData.get("lookbook_file");
//     const linesheetPdf = formData.get("linesheet_pdf");

//     if (!brandName) {
//       return { success: false, error: "Brand name is required" };
//     }

//     // =======================
//     // 2. Shopify GraphQL helper
//     // =======================
//     async function shopifyGraphQL(query, variables) {
//       const res = await fetch(
//         `https://${process.env.SHOPIFY_SHOP_URL}/admin/api/2023-10/graphql.json`,
//         {
//           method: "POST",
//           headers: {
//             "Content-Type": "application/json",
//             "X-Shopify-Access-Token": process.env.SHOPIFY_ACCESS_TOKEN
//           },
//           body: JSON.stringify({ query, variables })
//         }
//       );

//       const json = await res.json();
//       if (!res.ok || json.errors) {
//         throw new Error(JSON.stringify(json.errors || res.statusText));
//       }
//       return json.data;
//     }

//     // =======================
//     // 3. Ensure metaobject definition
//     // =======================
//     async function ensureMetaobjectDefinition() {
//       const checkQuery = `
//         query {
//           metaobjectDefinitions(first: 250) {
//             nodes { type }
//           }
//         }
//       `;

//       const data = await shopifyGraphQL(checkQuery);
//       const exists = data.metaobjectDefinitions.nodes.some(
//         d => d.type === "brand_configurator"
//       );

//       if (exists) return;

//       const createMutation = `
//         mutation CreateMetaobjectDefinition($definition: MetaobjectDefinitionCreateInput!) {
//           metaobjectDefinitionCreate(definition: $definition) {
//             userErrors { message }
//           }
//         }
//       `;

//       const definition = {
//         name: "Brand Configurator",
//         type: "brand_configurator",
//         fieldDefinitions: [
//           { name: "Brand Name", key: "brand_name", type: "single_line_text_field", required: true },
//           { name: "Bio", key: "bio", type: "single_line_text_field" },
//           { name: "Category", key: "category", type: "single_line_text_field" },
//           { name: "Phone", key: "phone", type: "single_line_text_field" },
//           { name: "Lookbook File", key: "lookbook_file", type: "file_reference" },
//           { name: "Linesheet PDF", key: "linesheet_pdf", type: "file_reference" }
//         ]
//       };

//       const res = await shopifyGraphQL(createMutation, { definition });
//       if (res.metaobjectDefinitionCreate.userErrors.length) {
//         throw new Error("Metaobject definition creation failed");
//       }
//     }

//     await ensureMetaobjectDefinition();

//     // =======================
//     // 4. File upload helpers
//     // =======================
//     async function stagedUpload(file) {
//       const query = `
//     mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
//       stagedUploadsCreate(input: $input) {
//         stagedTargets {
//           url
//           resourceUrl
//           parameters { name value }
//         }
//         userErrors { message }
//       }
//     }
//   `;

//       const data = await shopifyGraphQL(query, {
//         input: [{
//           filename: file.name,
//           mimeType: file.type || "application/octet-stream",
//           fileSize: file.size.toString(),  // ✅ must be string
//           resource: "FILE",
//           httpMethod: "POST"
//         }]
//       });

//       if (data.stagedUploadsCreate.userErrors.length) {
//         throw new Error(data.stagedUploadsCreate.userErrors[0].message);
//       }

//       return data.stagedUploadsCreate.stagedTargets[0];
//     }


//     async function uploadToS3(target, file) {
//       const s3Form = new FormData();

//       for (const param of target.parameters) {
//         s3Form.append(param.name, param.value);
//       }

//       s3Form.append("file", file);

//       const res = await fetch(target.url, {
//         method: "POST",
//         body: s3Form
//       });

//       if (!res.ok) {
//         const text = await res.text(); // 👈 important
//         console.error("S3 ERROR RESPONSE:", text);
//         throw new Error("S3 upload failed");
//       }
//     }


//     async function createShopifyFile(resourceUrl) {
//       const query = `
//         mutation fileCreate($files: [FileCreateInput!]!) {
//           fileCreate(files: $files) {
//             files { id }
//             userErrors { message }
//           }
//         }
//       `;

//       const data = await shopifyGraphQL(query, {
//         files: [{ originalSource: resourceUrl }]
//       });

//       return data.fileCreate.files[0].id;
//     }

//     // =======================
//     // 5. Upload files
//     // =======================
//     let lookbookFileId = null;
//     if (lookbookFile && lookbookFile.size > 0) {
//       const target = await stagedUpload(lookbookFile);
//       await uploadToS3(target, lookbookFile);
//       lookbookFileId = await createShopifyFile(target.resourceUrl);
//     }

//     let linesheetFileId = null;
//     if (linesheetPdf && linesheetPdf.size > 0) {
//       const target = await stagedUpload(linesheetPdf);
//       await uploadToS3(target, linesheetPdf);
//       linesheetFileId = await createShopifyFile(target.resourceUrl);
//     }

//     // =======================
//     // 6. Create metaobject
//     // =======================
//     const handle = `${brandName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`;

//     const fields = [
//       { key: "brand_name", value: brandName },
//       { key: "bio", value: bio || "" },
//       { key: "category", value: category || "" },
//       { key: "phone", value: phone || "" }
//     ];

//     if (lookbookFileId) {
//       fields.push({ key: "lookbook_file", value: lookbookFileId });
//     }

//     if (linesheetFileId) {
//       fields.push({ key: "linesheet_pdf", value: linesheetFileId });
//     }

//     const metaobjectMutation = `
//       mutation CreateMetaobject($handle: String!, $type: String!, $fields: [MetaobjectFieldInput!]!) {
//         metaobjectCreate(
//           metaobject: { handle: $handle, type: $type, fields: $fields }
//         ) {
//           metaobject { id }
//           userErrors { message }
//         }
//       }
//     `;

//     const metaobjectData = await shopifyGraphQL(metaobjectMutation, {
//       handle,
//       type: "brand_configurator",
//       fields
//     });

//     if (metaobjectData.metaobjectCreate.userErrors.length) {
//       throw new Error("Metaobject creation failed");
//     }

//     return {
//       success: true,
//       metaobjectId: metaobjectData.metaobjectCreate.metaobject.id
//     };

//   } catch (error) {
//     console.error(error);
//     return { success: false, error: error.message };
//   }
// }





import { authenticate } from "../shopify.server";

export async function action({ request }) {
  try {
    const { admin } = await authenticate.admin(request);

    // =======================
    // 1. Read form data
    // =======================
    const formData = await request.formData();
    const brandName = formData.get("brand_name");
    const bio = formData.get("bio");
    const category = formData.get("category");
    const phone = formData.get("phone");
    const lookbookFile = formData.get("lookbook_file");
    const linesheetPdf = formData.get("linesheet_pdf");

    if (!brandName) {
      return { success: false, error: "Brand name is required" };
    }

    // =======================
    // 2. Shopify GraphQL helper
    // =======================
    async function shopifyGraphQL(query, variables) {
      const response = await admin.graphql(query, { variables });
      const json = await response.json();

      if (!response.ok || json.errors) {
        throw new Error(JSON.stringify(json.errors || response.statusText));
      }
      return json.data;
    }

    // =======================
    // 3. Ensure metaobject definition
    // =======================
    async function ensureMetaobjectDefinition() {
      const checkQuery = `
        query {
          metaobjectDefinitions(first: 250) {
            nodes { type }
          }
        }
      `;
      const data = await shopifyGraphQL(checkQuery);
      const exists = data.metaobjectDefinitions.nodes.some(
        d => d.type === "brand_configurator"
      );

      if (exists) return;

      const createMutation = `
        mutation CreateMetaobjectDefinition($definition: MetaobjectDefinitionCreateInput!) {
          metaobjectDefinitionCreate(definition: $definition) {
            userErrors { message }
          }
        }
      `;

      const definition = {
        name: "Brand Configurator",
        type: "brand_configurator",
        fieldDefinitions: [
          { name: "Brand Name", key: "brand_name", type: "single_line_text_field", required: true },
          { name: "Bio", key: "bio", type: "single_line_text_field" },
          { name: "Category", key: "category", type: "single_line_text_field" },
          { name: "Phone", key: "phone", type: "single_line_text_field" },
          { name: "Lookbook File", key: "lookbook_file", type: "file_reference" },
          { name: "Linesheet PDF", key: "linesheet_pdf", type: "file_reference" }
        ]
      };

      const res = await shopifyGraphQL(createMutation, { definition });
      if (res.metaobjectDefinitionCreate.userErrors.length) {
        throw new Error("Metaobject definition creation failed");
      }
    }

    await ensureMetaobjectDefinition();

    // =======================
    // 4. File upload helpers
    // =======================
    async function stagedUpload(file) {
      const query = `
        mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
          stagedUploadsCreate(input: $input) {
            stagedTargets {
              url
              resourceUrl
              parameters { name value }
            }
            userErrors { message }
          }
        }
      `;

      const data = await shopifyGraphQL(query, {
        input: [{
          filename: file.name,
          mimeType: file.type || "application/octet-stream",
          fileSize: file.size.toString(),
          resource: "FILE",
          httpMethod: "POST"
        }]
      });

      if (data.stagedUploadsCreate.userErrors.length) {
        throw new Error(data.stagedUploadsCreate.userErrors[0].message);
      }

      return data.stagedUploadsCreate.stagedTargets[0];
    }

    async function uploadToS3(target, file) {
      const s3Form = new FormData();
      for (const param of target.parameters) {
        s3Form.append(param.name, param.value);
      }
      s3Form.append("file", file);

      const res = await fetch(target.url, { method: "POST", body: s3Form });
      if (!res.ok) {
        const text = await res.text();
        console.error("S3 ERROR RESPONSE:", text);
        throw new Error("S3 upload failed");
      }
    }

    async function createShopifyFile(resourceUrl) {
      const query = `
        mutation fileCreate($files: [FileCreateInput!]!) {
          fileCreate(files: $files) {
            files { id }
            userErrors { message }
          }
        }
      `;
      const data = await shopifyGraphQL(query, {
        files: [{ originalSource: resourceUrl }]
      });
      return data.fileCreate.files[0].id;
    }

    // =======================
    // 5. Upload files
    // =======================
    let lookbookFileId = null;
    if (lookbookFile && lookbookFile.size > 0) {
      const target = await stagedUpload(lookbookFile);
      await uploadToS3(target, lookbookFile);
      lookbookFileId = await createShopifyFile(target.resourceUrl);
    }

    let linesheetFileId = null;
    if (linesheetPdf && linesheetPdf.size > 0) {
      const target = await stagedUpload(linesheetPdf);
      await uploadToS3(target, linesheetPdf);
      linesheetFileId = await createShopifyFile(target.resourceUrl);
    }

    // =======================
    // 6. Create metaobject
    // =======================
    const handle = `${brandName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`;
    const fields = [
      { key: "brand_name", value: brandName },
      { key: "bio", value: bio || "" },
      { key: "category", value: category || "" },
      { key: "phone", value: phone || "" }
    ];

    if (lookbookFileId) fields.push({ key: "lookbook_file", value: lookbookFileId });
    if (linesheetFileId) fields.push({ key: "linesheet_pdf", value: linesheetFileId });

    const metaobjectMutation = `
      mutation CreateMetaobject($handle: String!, $type: String!, $fields: [MetaobjectFieldInput!]!) {
        metaobjectCreate(metaobject: { handle: $handle, type: $type, fields: $fields }) {
          metaobject { id }
          userErrors { message }
        }
      }
    `;

    const metaobjectData = await shopifyGraphQL(metaobjectMutation, {
      handle,
      type: "brand_configurator",
      fields
    });

    if (metaobjectData.metaobjectCreate.userErrors.length) {
      throw new Error("Metaobject creation failed");
    }

    return {
      success: true,
      metaobjectId: metaobjectData.metaobjectCreate.metaobject.id
    };

  } catch (error) {
    console.error(error);
    return { success: false, error: error.message };
  }
}
