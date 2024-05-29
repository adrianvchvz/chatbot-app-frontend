// eslint-disable-next-line no-unused-vars
import React, { useState, useEffect, useRef } from "react";
import { sendMessageToGemini } from "../src/key/gemini.js";
import { appFirebase } from "../src/key/firebase.js";
import { getFirestore, collection, addDoc, serverTimestamp, orderBy, query, onSnapshot, } from "firebase/firestore";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFilePdf } from "@fortawesome/free-solid-svg-icons";
import axios from "axios";

const firestore = getFirestore(appFirebase);

function ChatComponent() {
  const [userInput, setUserInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const [pdfText, setPdfText] = useState([]);
  const [pdfTextAppended, setPdfTextAppended] = useState(false);

  const [selectedFile, setSelectedFile] = useState(null);

  const extraerTexto = async (event) => {
    const file = event.target.files[0];
    setSelectedFile(file);

    const formData = new FormData();
    formData.append("pdf_file", file);

    try {
      const response = await axios.post(
        "https://chatbot-app-backend.onrender.com/api/prueba",
        formData
      );
      console.log("Respuesta del servidor:", response.data);
      setPdfText(response.data.subtitulos_texto);
      setPdfTextAppended(false);
    } catch (error) {
      console.error("Error al enviar archivo PDF:", error);
    }

    event.target.value = null;
  };

  useEffect(() => {
    const q = query(collection(firestore, "messages"), orderBy("timestamp"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const newMessages = snapshot.docs.map((doc) => doc.data());
      setMessages(newMessages);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const enviarMensajesSecuenciales = async () => {
    if (pdfText.length === 0) return;

    setIsLoading(true);

    const respuestas = [];

    for (const item of pdfText) {
      const combinedText = `${userInput}\n${item.text}`;
      
      try {
        const geminiResponse = await sendMessageToGemini(combinedText);
        respuestas.push(geminiResponse);

        setMessages((prevMessages) => [
          ...prevMessages,
          { text: `Usuario: ${userInput}\nTexto: ${item.text}`, sender: "user" },
          { text: geminiResponse, sender: "bot" },
        ]);

        await addDoc(collection(firestore, "messages"), {
          text: combinedText,
          sender: "user",
          timestamp: serverTimestamp(),
        });

        await addDoc(collection(firestore, "messages"), {
          text: geminiResponse,
          sender: "bot",
          timestamp: serverTimestamp(),
        });
      } catch (error) {
        console.error("Error al enviar mensaje al modelo:", error);
      }
    }

    setIsLoading(false);
    console.log("Respuestas del chatbot:", respuestas);
  };

  const enviarMensaje = async () => {
    if (userInput.trim() === "") return;

    setMessages((prevMessages) => [
      ...prevMessages,
      { text: userInput, sender: "user" },
    ]);

    setUserInput("");

    if (!pdfTextAppended) {
      await enviarMensajesSecuenciales();
      setPdfTextAppended(true);
    } else {
      try {
        setIsLoading(true);
        const geminiResponse = await sendMessageToGemini(userInput);
        setMessages((prevMessages) => [
          ...prevMessages,
          { text: geminiResponse, sender: "bot" },
        ]);

        await addDoc(collection(firestore, "messages"), {
          text: userInput,
          sender: "user",
          timestamp: serverTimestamp(),
        });

        await addDoc(collection(firestore, "messages"), {
          text: geminiResponse,
          sender: "bot",
          timestamp: serverTimestamp(),
        });
      } catch (error) {
        console.error("Error al enviar mensaje al modelo:", error);
      } finally {
        setIsLoading(false);
      }
    }
  };

  return (
    <div className="h-screen flex flex-col">
      <div className="text-center mt-2">
        <h1 className="mb-4 text-4xl font-extrabold leading-none tracking-tight text-gray-900 md:text-3xl lg:text-4xl dark:text-BLACK">
          CHAT BOT CON{" "}
          <span className="text-blue-600 dark:text-blue-500">GEMINI 1.5</span>
        </h1>
      </div>

      <div className="bg-gray-200 flex-1 overflow-y-scroll px-4 py-2">
        {messages.map((message, index) => (
          <div
            key={index}
            className={`flex ${
              message.sender === "user" ? "justify-end" : "justify-start"
            } mb-2`}
          >
            <div
              className={`bg-${
                message.sender === "user" ? "blue" : "black"
              }-500 text-black rounded-lg p-2 shadow max-w-lg`}
            >
              {message.sender === "user" ? (
                <strong>Usuario:</strong>
              ) : (
                <strong>Modelo:</strong>
              )}{" "}
              {message.text}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="bg-gray-100 px-4 py-2">
        {isLoading && (
          <p className="text-center text-gray-600">Enviando mensaje...</p>
        )}
        <div className="flex items-center">
          <textarea
            className="w-full border rounded py-2 px-4 mr-2"
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            placeholder="Escribe un mensaje..."
            disabled={isLoading}
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.shiftKey) {
                e.preventDefault();
                setUserInput((prevInput) => prevInput + "\n");
              } else if (e.key === "Enter") {
                e.preventDefault();
                enviarMensaje();
              }
            }}
          />

          <button
            className="bg-blue-500 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-full"
            onClick={enviarMensaje}
            disabled={isLoading || userInput.trim() === ""}
          >
            Enviar
          </button>
        </div>
        <div className="mr-2 ml-2 mt-2 flex items-center">
          <label htmlFor="file-upload" className="file-upload-label">
            <FontAwesomeIcon icon={faFilePdf} className="file-upload-icon" />
          </label>
          <input
            id="file-upload"
            type="file"
            accept=".pdf"
            onChange={extraerTexto}
            style={{ display: "none" }}
          />
          {selectedFile && (
            <p className="ml-2 text-xs">
              Archivo seleccionado: {selectedFile.name}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default ChatComponent;
